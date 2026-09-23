import "server-only";
import { eq, and, ne } from "drizzle-orm";
import { getDb } from "@/db";
import { payments } from "@/db/schema";
import { AppError } from "./errors";
import {
  fetchOrder,
  fetchOrderPayments,
  terminateOrder,
  type CashfreeOrder,
} from "./cashfree";
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

// All callers (webhook, return URL, status checks) use authoritative state.
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

/**
 * Reconcile a checkout the student has left. An active Cashfree order is only
 * closed after checking every payment attempt and confirming termination with
 * Cashfree. A successful or unresolved attempt is never abandoned.
 */
export async function closeAbandonedCashfreeCheckout(orderId: string) {
  const [record] = await getDb()
    .select()
    .from(payments)
    .where(eq(payments.cashfreeOrderId, orderId));
  if (!record) throw new AppError("Payment not found.", 404);
  if (record.attemptStatus === "paid" || record.status === "verified")
    return { state: "paid" as const, payment: record };
  let order = await fetchOrder(orderId);
  validateCashfreeOrder(order, record);
  const attempts = await fetchOrderPayments(orderId);
  const success = attempts.find((attempt) => attempt.status === "SUCCESS");
  if (success || order.order_status === "PAID") {
    if (order.order_status !== "PAID" || !success)
      throw new AppError(
        "Payment confirmation is still processing. Please check again.",
        503,
      );
    const payment = await settleProviderPayment(success);
    return { state: "paid" as const, payment };
  }
  const pending = attempts.find((attempt) => attempt.status === "PENDING");
  if (pending) {
    const payment = await settleProviderPayment({
      ...pending,
      status: "PENDING",
    });
    return { state: "processing" as const, payment };
  }
  const latest = [...attempts].sort((a, b) =>
    (b.time ?? "").localeCompare(a.time ?? ""),
  )[0];
  let payment =
    latest &&
    ["FAILED", "USER_DROPPED", "VOID", "CANCELLED"].includes(latest.status)
      ? await settleProviderPayment(latest)
      : record;
  const retryable = new Set([
    "FAILED",
    "USER_DROPPED",
    "VOID",
    "CANCELLED",
    "NOT_ATTEMPTED",
  ]);
  if (attempts.some((attempt) => !retryable.has(attempt.status)))
    return { state: "processing" as const, payment };

  if (order.order_status === "ACTIVE") {
    await terminateOrder(orderId);
    order = await fetchOrder(orderId);
    validateCashfreeOrder(order, record);
    const latestAttempts = await fetchOrderPayments(orderId);
    const latestSuccess = latestAttempts.find(
      (attempt) => attempt.status === "SUCCESS",
    );
    if (latestSuccess || order.order_status === "PAID") {
      if (order.order_status !== "PAID" || !latestSuccess)
        throw new AppError(
          "Payment confirmation is still processing. Please check again.",
          503,
        );
      payment = await settleProviderPayment(latestSuccess);
      return { state: "paid" as const, payment };
    }
    const latestPending = latestAttempts.find(
      (attempt) => attempt.status === "PENDING",
    );
    if (latestPending) {
      payment = await settleProviderPayment({
        ...latestPending,
        status: "PENDING",
      });
      return { state: "processing" as const, payment };
    }
    if (latestAttempts.some((attempt) => !retryable.has(attempt.status)))
      return { state: "processing" as const, payment };
  }

  if (!["EXPIRED", "TERMINATED"].includes(order.order_status))
    return { state: "processing" as const, payment };

  const [closed] = await getDb()
    .update(payments)
    .set({
      status: "failed",
      attemptStatus: "abandoned",
      reviewNote: "Cashfree order closed; safe to create a new checkout.",
    })
    .where(
      and(
        eq(payments.id, record.id),
        ne(payments.status, "verified"),
        ne(payments.attemptStatus, "paid"),
      ),
    )
    .returning();
  if (closed) return { state: "retry" as const, payment: closed };

  // An earlier reconciliation may already have marked a definitive failure.
  const [current] = await getDb()
    .select()
    .from(payments)
    .where(eq(payments.id, record.id));
  if (current?.attemptStatus === "paid" || current?.status === "verified")
    return { state: "paid" as const, payment: current };
  if (
    current?.attemptStatus === "failed" ||
    current?.attemptStatus === "cancelled"
  ) {
    const [abandoned] = await getDb()
      .update(payments)
      .set({
        status: "failed",
        attemptStatus: "abandoned",
        reviewNote: "Cashfree order closed; safe to create a new checkout.",
      })
      .where(and(eq(payments.id, record.id), eq(payments.status, "failed")))
      .returning();
    return abandoned
      ? { state: "retry" as const, payment: abandoned }
      : { state: "processing" as const, payment: current };
  }
  return { state: "processing" as const, payment: current ?? payment };
}
