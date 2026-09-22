import { rateLimit } from "@/lib/rate-limit";
import { and, desc, eq, ne } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { payments, studentProfiles } from "@/db/schema";
import { requireUser } from "@/lib/access";
import { AppError } from "@/lib/errors";
import { jsonBody, mutation } from "@/lib/http";
import { idSchema } from "@/lib/validation";
import { feeBalance, lockFee } from "@/lib/ledger";
import {
  cashfreeCallbackUrls,
  CashfreeApiError,
  createOrder,
  fetchOrder,
} from "@/lib/cashfree";
import {
  validateCashfreeOrder,
  verifyCashfreePayment,
} from "@/lib/payment-verification";

export const POST = mutation(async (req) => {
  const user = await requireUser();
  await rateLimit(user.id, "payments/order", 20);
  const { feeDueId } = z
    .object({ feeDueId: idSchema })
    .parse(await jsonBody(req));
  const orderMeta = cashfreeCallbackUrls();
  const [profile] = await getDb()
    .select()
    .from(studentProfiles)
    .where(eq(studentProfiles.userId, user.id));
  if (!profile) throw new AppError("Complete your profile first.");
  const phone = profile.phone.replace(/\D/g, "").replace(/^91(?=\d{10}$)/, "");
  if (!/^[6-9]\d{9}$/.test(phone))
    throw new AppError(
      "Update your profile with a valid mobile number before paying.",
    );

  // Commit a durable reservation before contacting Cashfree. Retries and double
  // clicks share the order ID and idempotency key, including after API timeouts.
  const reservation = await getDb().transaction(async (tx) => {
    const fee = await lockFee(tx, feeDueId);
    if (fee.userId !== user.id) throw new AppError("Fee not found.", 404);
    const amount = await feeBalance(tx, fee);
    if (!amount) throw new AppError("This fee is already paid.");
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
          ne(payments.attemptStatus, "paid"),
        ),
      )
      .orderBy(desc(payments.createdAt))
      .limit(1);
    // Reuse even a locally expired/failed record until the provider confirms closure.
    const reusable = pending ?? previous;
    if (
      reusable &&
      reusable.reviewNote !==
        "Cashfree order closed; safe to create a new checkout."
    ) {
      return { record: reusable, existing: true, balance: amount };
    }
    const id = crypto.randomUUID();
    const [record] = await tx
      .insert(payments)
      .values({
        id,
        userId: user.id,
        feeDueId: fee.id,
        amount,
        method: "cashfree",
        attemptStatus: "checkout_started",
        cashfreeOrderId: `apna_${id.replace(/-/g, "")}`,
      })
      .returning();
    return { record, existing: false, balance: amount };
  });
  const { record, existing } = reservation;
  const orderId = record.cashfreeOrderId!;
  const expiresAt = new Date(
    record.createdAt.getTime() + 30 * 60 * 1000,
  ).toISOString();
  let order;
  if (existing) {
    try {
      order = await fetchOrder(orderId);
    } catch (error) {
      if (!(error instanceof CashfreeApiError) || error.providerStatus !== 404)
        throw error;
      // If the first request never reached Cashfree, retry the same reservation.
      if (Date.parse(expiresAt) <= Date.now() + 5 * 60 * 1000) {
        await closeReservation(record.id);
        throw new AppError(
          "The checkout expired. Please select Pay online again.",
          409,
        );
      }
    }
  }
  if (!order) {
    order = await createOrder(
      {
        order_id: orderId,
        order_amount: record.amount / 100,
        order_currency: "INR",
        customer_details: {
          customer_id: user.id.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 50),
          customer_phone: phone,
          customer_email: user.email,
          customer_name: profile.fullName,
        },
        order_expiry_time: expiresAt,
        order_meta: orderMeta,
      },
      record.id,
    );
  }
  validateCashfreeOrder(order, record);
  if (order.order_status === "PAID") {
    await verifyCashfreePayment(orderId);
    return Response.json({ orderId, alreadyPaid: true });
  }
  if (["EXPIRED", "TERMINATED"].includes(order.order_status)) {
    const verified = await verifyCashfreePayment(orderId);
    if (
      verified.attemptStatus !== "paid" &&
      verified.attemptStatus !== "pending"
    )
      await closeReservation(record.id);
    throw new AppError(
      "The previous checkout has closed. Please select Pay online again.",
      409,
    );
  }
  if (order.order_status !== "ACTIVE" || !order.payment_session_id) {
    throw new AppError(
      "This payment is still being processed. Check its status before paying again.",
      409,
    );
  }
  if (record.amount !== reservation.balance)
    throw new AppError(
      "Your fee balance changed. Wait for the current checkout to expire before paying again.",
      409,
    );
  return Response.json({
    payment_session_id: order.payment_session_id,
    orderId: order.order_id,
    amount: record.amount,
    expiresAt: order.order_expiry_time ?? expiresAt,
  });
});

async function closeReservation(id: string) {
  await getDb()
    .update(payments)
    .set({
      status: "failed",
      attemptStatus: "abandoned",
      reviewNote: "Cashfree order closed; safe to create a new checkout.",
    })
    .where(
      and(
        eq(payments.id, id),
        ne(payments.status, "verified"),
        ne(payments.attemptStatus, "paid"),
      ),
    );
}
