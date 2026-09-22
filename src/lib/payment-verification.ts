import "server-only";
import { eq, and } from "drizzle-orm";
import { getDb } from "@/db";
import { payments } from "@/db/schema";
import { AppError } from "./errors";
import { fetchOrder, fetchOrderPayments, type CashfreeOrder } from "./cashfree";
import { settleProviderPayment } from "./ledger";

export function validateCashfreeOrder(
  order: CashfreeOrder,
  record: Pick<
    typeof payments.$inferSelect,
    "cashfreeOrderId" | "amount" | "method"
  >,
) {
  if (
    record.method !== "cashfree" ||
    order.order_id !== record.cashfreeOrderId ||
    order.order_currency !== "INR" ||
    Math.round(order.order_amount * 100) !== record.amount
  ) {
    throw new AppError("Payment order details do not match.", 409);
  }
}

// All callers (webhook, return URL, manual reconciliation) use authoritative state.
export async function verifyCashfreePayment(orderId: string) {
  const [record] = await getDb()
    .select()
    .from(payments)
    .where(eq(payments.cashfreeOrderId, orderId));
  if (!record) throw new AppError("Payment not found.", 404);
  const order = await fetchOrder(orderId);
  validateCashfreeOrder(order, record);
  const attempts = await fetchOrderPayments(orderId);
  const success = attempts.find((p) => p.status === "SUCCESS");
  if (order.order_status === "PAID" || success) {
    // A temporarily inconsistent provider response must be retried, never credited.
    if (order.order_status !== "PAID" || !success) {
      throw new AppError(
        "Payment confirmation is still processing. Please check again.",
        503,
      );
    }
    return settleProviderPayment(success);
  }
  // Never downgrade a capture, even if a stale provider response arrives later.
  if (record.attemptStatus === "paid" || record.status === "verified")
    return record;
  const pending = attempts.find((p) => p.status === "PENDING");
  if (pending) return settleProviderPayment({ ...pending, status: "PENDING" });
  const latest = [...attempts].sort((a, b) =>
    (b.time ?? "").localeCompare(a.time ?? ""),
  )[0];
  if (
    latest &&
    ["FAILED", "USER_DROPPED", "VOID", "CANCELLED"].includes(latest.status)
  ) {
    return settleProviderPayment(latest);
  }
  if (["EXPIRED", "TERMINATED"].includes(order.order_status)) {
    const [updated] = await getDb()
      .update(payments)
      .set({
        status: "failed",
        attemptStatus: "abandoned",
        reviewNote: "Payment order closed without a successful payment.",
      })
      .where(and(eq(payments.id, record.id), eq(payments.status, "pending")))
      .returning();
    if (updated) return updated;
  }
  // ACTIVE is not failure: the bank or customer may still complete this order.
  return (
    await getDb().select().from(payments).where(eq(payments.id, record.id))
  )[0];
}
