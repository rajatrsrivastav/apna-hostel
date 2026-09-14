import "server-only";
import { and, eq, sql, lte } from "drizzle-orm";
import { getDb } from "@/db";
import { feeDues, payments } from "@/db/schema";
import { AppError } from "./errors";
import { balance } from "./money";
import type { ProviderPayment } from "./razorpay";
import {
  notifyPaymentSuccess,
  notifyPaymentIncomplete,
} from "./notifications";
export type Transaction = Parameters<
  Parameters<ReturnType<typeof getDb>["transaction"]>[0]
>[0];
export async function lockFee(tx: Transaction, id: string) {
  const [fee] = await tx
    .select()
    .from(feeDues)
    .where(eq(feeDues.id, id))
    .for("update");
  if (!fee) throw new AppError("Fee not found.", 404);
  return fee;
}
export async function feeBalance(
  tx: Transaction,
  fee: typeof feeDues.$inferSelect,
) {
  const [totals] = await tx
    .select({ paid: sql<number>`coalesce(sum(${payments.amount}), 0)::int` })
    .from(payments)
    .where(and(eq(payments.feeDueId, fee.id), eq(payments.status, "verified")));
  return balance(fee.amount, totals.paid, fee.waivedAmount);
}
// Both checkout verification and webhooks converge here. A row lock serializes
// duplicate/out-of-order notifications and manual review against the same fee.
export async function settleProviderPayment(provider: ProviderPayment) {
  const db = getDb();
  const [record] = await db
    .select()
    .from(payments)
    .where(eq(payments.razorpayOrderId, provider.order_id));
  if (!record)
    throw new AppError("Order not yet recorded. Retry notification.", 503);
  const result = await db.transaction(async (tx) => {
    const fee = await lockFee(tx, record.feeDueId);
    const [payment] = await tx
      .select()
      .from(payments)
      .where(eq(payments.id, record.id));
    if (
      provider.currency !== "INR" ||
      provider.amount !== payment.amount ||
      payment.method !== "razorpay"
    )
      throw new AppError("Payment amount does not match the order.", 409);
    if (payment.status === "verified" || payment.attemptStatus === "paid") {
      if (
        payment.razorpayPaymentId !== provider.id &&
        provider.status === "captured"
      )
        throw new AppError("Order has a different captured payment.", 409);
      return payment;
    }
    // Failed attempts are not terminal for an order: Razorpay can retry the same order.
    if (provider.status === "failed") {
      const [failed] = await tx
        .update(payments)
        .set({
          status: "failed",
          attemptStatus: "failed",
          reviewNote: "Online payment failed. You can try again.",
        })
        .where(eq(payments.id, payment.id))
        .returning();
      return failed;
    }
    if (provider.status !== "captured" || provider.captured === false) {
      if (provider.status === "authorized" && payment.status === "pending") {
        await tx
          .update(payments)
          .set({ attemptStatus: "pending" })
          .where(eq(payments.id, payment.id));
      }
      return payment;
    }
    // Record real excess captures for office refund review, without crediting rent twice.
    const remaining = await feeBalance(tx, fee);
    const excess = payment.amount > remaining;
    const [updated] = await tx
      .update(payments)
      .set({
        status: excess ? "rejected" : "verified",
        attemptStatus: "paid",
        razorpayPaymentId: provider.id,
        reviewNote: excess
          ? "Payment captured after the fee balance changed. Office refund review required; no duplicate rent credit applied."
          : null,
        reviewedAt: new Date(),
      })
      .where(eq(payments.id, payment.id))
      .returning();
    return updated;
  });

  if (result.status === "verified" && result.attemptStatus === "paid") {
    try {
      await notifyPaymentSuccess(result.id);
    } catch (err) {
      console.error("[Notification] notifyPaymentSuccess failed:", err);
    }
  } else if (result.status === "failed" && result.attemptStatus === "failed") {
    try {
      await notifyPaymentIncomplete(result.id, "failed");
    } catch (err) {
      console.error("[Notification] notifyPaymentIncomplete failed:", err);
    }
  }

  return result;
}

// Conditional updates cannot overwrite a capture, even when expiry races a webhook.
export async function expireProviderAttempts(
  userId: string,
  db: ReturnType<typeof getDb> | Transaction = getDb(),
  feeDueId?: string,
) {
  await db
    .update(payments)
    .set({
      status: "failed",
      attemptStatus: "abandoned",
      reviewNote: "Payment checkout expired. You can try again.",
    })
    .where(
      and(
        eq(payments.userId, userId),
        feeDueId ? eq(payments.feeDueId, feeDueId) : undefined,
        eq(payments.method, "razorpay"),
        eq(payments.status, "pending"),
        lte(payments.createdAt, new Date(Date.now() - 15 * 60 * 1000)),
      ),
    );
}
