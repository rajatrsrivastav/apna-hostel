import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { feeDues, payments } from "@/db/schema";
import { AppError } from "./errors";
import { balance } from "./money";
import type { ProviderPayment } from "./razorpay";
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
  return db.transaction(async (tx) => {
    await lockFee(tx, record.feeDueId);
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
    if (payment.status === "verified") {
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
          reviewNote: "Online payment failed. You can try again.",
        })
        .where(eq(payments.id, payment.id))
        .returning();
      return failed;
    }
    if (provider.status !== "captured" || provider.captured === false)
      return payment;
    const [updated] = await tx
      .update(payments)
      .set({
        status: "verified",
        razorpayPaymentId: provider.id,
        reviewNote: null,
        reviewedAt: new Date(),
      })
      .where(eq(payments.id, payment.id))
      .returning();
    return updated;
  });
}
