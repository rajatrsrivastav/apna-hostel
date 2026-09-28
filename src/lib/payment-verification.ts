import "server-only";
import { eq, and, ne, or, isNull, desc } from "drizzle-orm";
import { getDb } from "@/db";
import { payments } from "@/db/schema";
import { AppError } from "./errors";
import {
  CashfreeApiError,
  fetchOrder,
  fetchOrderPayments,
  type CashfreeOrder,
} from "./cashfree";
import { settleProviderPayment } from "./ledger";

export const ORDER_LIFETIME_MS = 30 * 60 * 1000;
const closedOrders = new Set(["EXPIRED", "TERMINATED", "CANCELLED"]);
const unsuccessfulPayments = new Set([
  "FAILED",
  "USER_DROPPED",
  "VOID",
  "CANCELLED",
  "EXPIRED",
  "NOT_ATTEMPTED",
]);

type PaymentRecord = typeof payments.$inferSelect;
export type CheckoutState = "paid" | "processing" | "closing" | "retry";

export async function markCheckoutRetryable(
  record: PaymentRecord,
  closed: boolean,
) {
  const [updated] = await getDb()
    .update(payments)
    .set({
      status: "failed",
      // An ACTIVE order remains reusable. Only provider-confirmed closure (or
      // an expired reservation missing at the provider) releases its order ID.
      attemptStatus: closed ? "abandoned" : "cancelled",
      reviewNote: closed
        ? "Cashfree order closed; safe to create a new checkout."
        : "Checkout was not completed. You can try paying again.",
    })
    .where(
      and(
        eq(payments.id, record.id),
        ne(payments.status, "verified"),
        or(isNull(payments.attemptStatus), ne(payments.attemptStatus, "paid")),
        closed
          ? undefined
          : or(
              isNull(payments.attemptStatus),
              ne(payments.attemptStatus, "abandoned"),
            ),
      ),
    )
    .returning();
  return (
    updated ??
    (await getDb().select().from(payments).where(eq(payments.id, record.id)))[0]
  );
}

// All students use this path, including legacy failed/checkout_started rows.
export async function reconcileStudentCashfreePayments(userId: string) {
  const unresolved = await getDb()
    .select()
    .from(payments)
    .where(
      and(
        eq(payments.userId, userId),
        eq(payments.method, "cashfree"),
        ne(payments.status, "verified"),
        or(
          isNull(payments.attemptStatus),
          and(
            ne(payments.attemptStatus, "paid"),
            ne(payments.attemptStatus, "abandoned"),
          ),
        ),
      ),
    )
    .orderBy(desc(payments.createdAt));
  for (const record of unresolved) {
    if (!record.cashfreeOrderId) continue;
    try {
      await reconcileCashfreeCheckout(record.cashfreeOrderId);
    } catch (error) {
      if (
        error instanceof CashfreeApiError &&
        error.providerStatus === 404 &&
        Date.now() - record.createdAt.getTime() >= ORDER_LIFETIME_MS
      ) {
        await markCheckoutRetryable(record, true);
        continue;
      }
      // A provider outage does not hide the fee page or imply payment failure.
      console.error("[Cashfree] Student reconciliation unavailable", {
        type: error instanceof Error ? error.name : "UnknownError",
      });
    }
  }
}

export function validateCashfreeOrder(
  order: CashfreeOrder,
  record: Pick<PaymentRecord, "cashfreeOrderId" | "amount" | "method">,
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

/**
 * Read order AND transactions before choosing a checkout action. ACTIVE is an
 * unpaid order, not evidence of a bank payment. Reuse it for a retry instead of
 * terminating it: termination is asynchronous and can strand NOT_ATTEMPTED
 * checkouts in TERMINATION_REQUESTED. Never expire a bank PENDING by local age.
 */
export async function reconcileCashfreeCheckout(orderId: string): Promise<{
  state: CheckoutState;
  payment: PaymentRecord;
  order: CashfreeOrder;
}> {
  const [record] = await getDb()
    .select()
    .from(payments)
    .where(eq(payments.cashfreeOrderId, orderId));
  if (!record) throw new AppError("Payment not found.", 404);
  const [order, attempts] = await Promise.all([
    fetchOrder(orderId),
    fetchOrderPayments(orderId),
  ]);
  validateCashfreeOrder(order, record);
  const result = (state: CheckoutState, payment = record) => ({
    state,
    payment,
    order,
  });
  const success = attempts.find((p) => p.status === "SUCCESS");
  if (order.order_status === "PAID" || success) {
    if (order.order_status !== "PAID" || !success) {
      throw new AppError(
        "Payment confirmation is still processing. Please check again.",
        503,
      );
    }
    return result("paid", await settleProviderPayment(success));
  }
  if (record.attemptStatus === "paid" || record.status === "verified")
    return result("paid");
  const pending = attempts.find((p) => p.status === "PENDING");
  if (pending)
    return result("processing", await settleProviderPayment(pending));
  // Unknown provider states fail closed rather than risking another charge.
  if (attempts.some((p) => !unsuccessfulPayments.has(p.status))) {
    throw new AppError(
      "Cashfree has not confirmed this checkout's status. Please check again shortly.",
      503,
    );
  }
  const closed = closedOrders.has(order.order_status);
  if (
    !closed &&
    !["ACTIVE", "TERMINATION_REQUESTED"].includes(order.order_status)
  ) {
    throw new AppError(
      "Cashfree has not confirmed this order's status. Please check again shortly.",
      503,
    );
  }
  const latest = [...attempts].sort((a, b) =>
    (b.time ?? "").localeCompare(a.time ?? ""),
  )[0];
  const payment =
    !closed && latest && ["FAILED", "VOID", "EXPIRED"].includes(latest.status)
      ? await settleProviderPayment(latest)
      : await markCheckoutRetryable(record, closed);
  if (payment.attemptStatus === "paid" || payment.status === "verified")
    return result("paid", payment);
  return result(
    order.order_status === "TERMINATION_REQUESTED" ? "closing" : "retry",
    payment,
  );
}

// Webhooks and return-page verification settle the very same payment record.
export async function verifyCashfreePayment(orderId: string) {
  return (await reconcileCashfreeCheckout(orderId)).payment;
}
