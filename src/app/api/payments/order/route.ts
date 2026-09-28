import { rateLimit } from "@/lib/rate-limit";
import { and, desc, eq, ne, or, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { payments, studentProfiles, users } from "@/db/schema";
import { requireUser } from "@/lib/access";
import { AppError } from "@/lib/errors";
import { jsonBody, mutation } from "@/lib/http";
import { amountSchema, idSchema } from "@/lib/validation";
import { feeBalance, lockFee } from "@/lib/ledger";
import {
  cashfreeCallbackUrls,
  CashfreeApiError,
  createOrder,
  fetchOrder,
} from "@/lib/cashfree";
import {
  reconcileCashfreeCheckout,
  markCheckoutRetryable,
  ORDER_LIFETIME_MS,
  validateCashfreeOrder,
} from "@/lib/payment-verification";
import { collectionStarted, isPostLaunchFee } from "@/lib/fee-policy";
import { nextStudentPayment } from "@/lib/installments";

export const POST = mutation(async (req) => {
  const user = await requireUser();
  await rateLimit(user.id, "payments/order", 20);
  const body = z.object({
    feeDueId: idSchema.optional(),
    amount: amountSchema,
    phone: z.string().optional(),
  }).parse(await jsonBody(req));
  const adminSelf = user.role === "admin";
  if (adminSelf === Boolean(body.feeDueId))
    throw new AppError("Choose a valid payment account.");
  const orderMeta = cashfreeCallbackUrls(adminSelf ? "admin" : "student");
  const [profile] = adminSelf ? [] : await getDb()
    .select()
    .from(studentProfiles)
    .where(eq(studentProfiles.userId, user.id));
  if (!adminSelf && !profile) throw new AppError("Complete your profile first.");
  const phone = (adminSelf ? body.phone ?? "" : profile!.phone).replace(/\D/g, "").replace(/^91(?=\d{10}$)/, "");
  if (!/^[6-9]\d{9}$/.test(phone))
    throw new AppError(
      adminSelf ? "Enter a valid mobile number before paying." : "Update your profile with a valid mobile number before paying.",
    );

  // Each retry reserves under the fee lock. Cashfree idempotency also protects
  // two requests that both observe a reservation before Create Order returns.
  for (let retry = 0; retry < 3; retry++) {
    const reservation = adminSelf
      ? await reserveAdminPayment(user.id, body.amount)
      : await reservePayment(user.id, body.feeDueId!, body.amount);
    const { record, existing } = reservation;
    const orderId = record.cashfreeOrderId!;
    const expiresAt = new Date(
      record.createdAt.getTime() + ORDER_LIFETIME_MS,
    ).toISOString();
    let order;
    if (existing) {
      try {
        const result = await reconcileCashfreeCheckout(orderId);
        if (result.state === "paid")
          return Response.json({ orderId, alreadyPaid: true });
        if (result.state === "processing" || result.state === "closing") {
          return Response.json(
            {
              orderId,
              state: result.state,
              retryAfterMs: 3000,
              message:
                result.state === "processing"
                  ? "Cashfree is confirming a bank payment. Please wait before paying again."
                  : "Your previous checkout is closing. We are checking when you can retry.",
            },
            { status: 202 },
          );
        }
        if (result.order.order_status !== "ACTIVE") continue;
        order = result.order;
      } catch (error) {
        if (
          !(error instanceof CashfreeApiError) ||
          error.providerStatus !== 404
        )
          throw error;
        // An interrupted create can reuse its ID. Only a confirmed missing,
        // expiring reservation is replaced; network errors never release it.
        if (Date.parse(expiresAt) <= Date.now() + 5 * 60 * 1000) {
          await markCheckoutRetryable(record, true);
          continue;
        }
      }
    }
    if (!order) {
      try {
        order = await createOrder(
          {
            order_id: orderId,
            order_amount: record.amount / 100,
            order_currency: "INR",
            customer_details: {
              customer_id: user.id.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 50),
              customer_phone: phone,
              customer_email: user.email,
              customer_name: profile?.fullName ?? user.name,
            },
            order_expiry_time: expiresAt,
            order_meta: orderMeta,
          },
          record.id,
        );
      } catch (error) {
        if (
          !(error instanceof CashfreeApiError) ||
          error.providerStatus !== 409
        )
          throw error;
        // Another request may already have created this exact reserved order.
        order = await fetchOrder(orderId);
      }
    }
    validateCashfreeOrder(order, record);
    if (order.order_status !== "ACTIVE") continue;
    if (!order.payment_session_id)
      throw new AppError(
        "Cashfree checkout is unavailable. Please try again shortly.",
        503,
      );
    if (reservation.balance !== null && record.amount > reservation.balance)
      throw new AppError(
        "Your fee balance changed. Please check payment status before trying again.",
        409,
      );
    if (reservation.expectedAmount !== null && record.amount !== reservation.expectedAmount)
      throw new AppError(
        "A previous checkout has a different amount. Check its status before paying again.",
        409,
      );
    // Reopening the SAME active order cannot create a second payable order.
    // Its age is irrelevant while Cashfree allows a retry and no bank payment
    // is pending. In particular, NOT_ATTEMPTED must never block Pay Now.
    return Response.json({
      payment_session_id: order.payment_session_id,
      orderId: order.order_id,
      amount: record.amount,
      expiresAt: order.order_expiry_time ?? expiresAt,
    });
  }
  throw new AppError("Checkout status changed. Please try again.", 503);
});

async function reservePayment(userId: string, feeDueId: string, requestedAmount: number) {
  return getDb().transaction(async (tx) => {
    const fee = await lockFee(tx, feeDueId);
    if (fee.userId !== userId) throw new AppError("Fee not found.", 404);
    if (!collectionStarted() || !isPostLaunchFee(fee))
      throw new AppError("Fee collection starts on 1 October 2026.", 409);
    const amount = await feeBalance(tx, fee);
    if (!amount) throw new AppError("This fee is already paid.");
    const [progress] = await tx.select({
      count: sql<number>`count(*)::int`,
    }).from(payments).where(and(
      eq(payments.feeDueId, fee.id), eq(payments.status, "verified"),
    ));
    const nextPayment = nextStudentPayment({
      outstanding: amount, verifiedPaymentCount: progress.count, rentMonth: fee.rentMonth,
    });
    if (!nextPayment)
      throw new AppError("This fee needs office review before another payment.", 409);
    if (requestedAmount !== nextPayment.amount)
      throw new AppError(
        `This fee's next payment is ₹${(nextPayment.amount / 100).toFixed(2)}. Refresh and try again.`,
        409,
      );
    const [pending] = await tx
      .select()
      .from(payments)
      .where(
        and(eq(payments.feeDueId, fee.id), eq(payments.status, "pending")),
      );
    if (pending && pending.method !== "cashfree")
      throw new AppError("Your payment is awaiting verification.", 409);
    const [previous] = await tx
      .select()
      .from(payments)
      .where(
        and(
          eq(payments.feeDueId, fee.id),
          eq(payments.method, "cashfree"),
          or(
            isNull(payments.attemptStatus),
            and(
              ne(payments.attemptStatus, "paid"),
              ne(payments.attemptStatus, "abandoned"),
            ),
          ),
        ),
      )
      .orderBy(desc(payments.createdAt))
      .limit(1);
    const reusable = pending ?? previous;
    if (reusable && reusable.attemptStatus !== "abandoned") {
      return { record: reusable, existing: true, balance: amount, expectedAmount: nextPayment.amount };
    }
    const id = crypto.randomUUID();
    const [record] = await tx
      .insert(payments)
      .values({
        id,
        userId,
        feeDueId: fee.id,
        amount: requestedAmount,
        method: "cashfree",
        attemptStatus: "checkout_started",
        cashfreeOrderId: `apna_${id.replace(/-/g, "")}`,
      })
      .returning();
    return { record, existing: false, balance: amount, expectedAmount: nextPayment.amount };
  });
}

async function reserveAdminPayment(userId: string, requestedAmount: number) {
  return getDb().transaction(async (tx) => {
    const [admin] = await tx.select({ role: users.role }).from(users)
      .where(eq(users.id, userId)).for("update");
    if (admin?.role !== "admin") throw new AppError("Admin access required.", 403);
    const [pending] = await tx.select().from(payments).where(and(
      eq(payments.userId, userId), isNull(payments.feeDueId),
      eq(payments.method, "cashfree"), eq(payments.status, "pending"),
    ));
    const [previous] = await tx.select().from(payments).where(and(
      eq(payments.userId, userId), isNull(payments.feeDueId),
      eq(payments.method, "cashfree"),
      or(isNull(payments.attemptStatus), and(
        ne(payments.attemptStatus, "paid"), ne(payments.attemptStatus, "abandoned"),
      )),
    )).orderBy(desc(payments.createdAt)).limit(1);
    const reusable = pending ?? previous;
    if (reusable && reusable.attemptStatus !== "abandoned")
      return { record: reusable, existing: true, balance: null, expectedAmount: null };
    const id = crypto.randomUUID();
    const [record] = await tx.insert(payments).values({
      id, userId, feeDueId: null, amount: requestedAmount, method: "cashfree",
      attemptStatus: "checkout_started", cashfreeOrderId: `apna_${id.replace(/-/g, "")}`,
    }).returning();
    return { record, existing: false, balance: null, expectedAmount: null };
  });
}
