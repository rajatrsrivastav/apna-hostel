import "server-only";
import { and, eq, ne, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { feeDues, payments } from "@/db/schema";
import { AppError } from "./errors";
import { balance } from "./money";
import type { ProviderPayment } from "./cashfree";
import { notifyPaymentSuccess, notifyPaymentIncomplete } from "./notifications";
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
    .where(eq(payments.cashfreeOrderId, provider.order_id));
  if (!record)
    throw new AppError("Order not yet recorded. Retry notification.", 503);
  let changed = false;
  const result = await db.transaction(async (tx) => {
    const fee = await lockFee(tx, record.feeDueId);
    const [payment] = await tx
      .select()
      .from(payments)
      .where(eq(payments.id, record.id));
    if (
      provider.currency !== "INR" ||
      provider.amount !== payment.amount ||
      payment.method !== "cashfree"
    )
      throw new AppError("Payment amount does not match the order.", 409);
    if (payment.status === "verified" || payment.attemptStatus === "paid") {
      if (
        payment.cashfreePaymentId !== provider.id &&
        provider.status === "SUCCESS"
      )
        throw new AppError("Order has a different captured payment.", 409);
      return payment;
    }
    // Failed attempts are not terminal for an order: Cashfree can retry the same order.
    if (
      ["FAILED", "USER_DROPPED", "VOID", "CANCELLED"].includes(provider.status)
    ) {
      const attemptStatus =
        provider.status === "USER_DROPPED" || provider.status === "CANCELLED"
          ? "cancelled"
          : "failed";
      if (
        payment.status === "failed" &&
        payment.attemptStatus === attemptStatus
      )
        return payment;
      changed = true;
      const [failed] = await tx
        .update(payments)
        .set({
          status: "failed",
          attemptStatus,
          reviewNote: "Online payment failed. You can try again.",
        })
        .where(eq(payments.id, payment.id))
        .returning();
      return failed;
    }
    if (provider.status !== "SUCCESS") {
      if (provider.status === "PENDING") {
        const [otherPending] = await tx
          .select({ id: payments.id })
          .from(payments)
          .where(
            and(
              eq(payments.feeDueId, payment.feeDueId),
              eq(payments.status, "pending"),
              ne(payments.id, payment.id),
            ),
          );
        const [updated] = await tx
          .update(payments)
          .set({
            attemptStatus: "pending",
            ...(!otherPending ? { status: "pending" as const } : {}),
          })
          .where(eq(payments.id, payment.id))
          .returning();
        return updated;
      }
      return payment;
    }
    // Record real excess captures for office refund review, without crediting rent twice.
    const remaining = await feeBalance(tx, fee);
    const excess = payment.amount > remaining;
    changed = true;
    const [updated] = await tx
      .update(payments)
      .set({
        status: excess ? "rejected" : "verified",
        attemptStatus: "paid",
        cashfreePaymentId: provider.id,
        reviewNote: excess
          ? "Payment captured after the fee balance changed. Office refund review required; no duplicate rent credit applied."
          : null,
        reviewedAt: new Date(),
      })
      .where(eq(payments.id, payment.id))
      .returning();
    return updated;
  });

  if (
    changed &&
    result.status === "verified" &&
    result.attemptStatus === "paid"
  ) {
    try {
      await notifyPaymentSuccess(result.id);
    } catch (err) {
      console.error("[Notification] notifyPaymentSuccess failed:", err instanceof Error ? err.name : "UnknownError");
    }
  } else if (
    changed &&
    result.status === "failed" &&
    result.attemptStatus === "failed"
  ) {
    try {
      await notifyPaymentIncomplete(result.id, "failed");
    } catch (err) {
      console.error("[Notification] notifyPaymentIncomplete failed:", err instanceof Error ? err.name : "UnknownError");
    }
  }

  return result;
}
