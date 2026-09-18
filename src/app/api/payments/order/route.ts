import { rateLimit } from "@/lib/rate-limit";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { payments, studentProfiles } from "@/db/schema";
import { requireUser } from "@/lib/access";
import { AppError } from "@/lib/errors";
import { jsonBody, mutation } from "@/lib/http";
import { idSchema } from "@/lib/validation";
import { expireProviderAttempts, feeBalance, lockFee } from "@/lib/ledger";
import { createOrder } from "@/lib/cashfree";
import { requiredEnv } from "@/lib/env";
export const POST = mutation(async (req) => {
  const user = await requireUser();
  await rateLimit(user.id, "payments/order", 20);
  const { feeDueId } = z
    .object({ feeDueId: idSchema })
    .parse(await jsonBody(req));
  const [profile] = await getDb()
    .select()
    .from(studentProfiles)
    .where(eq(studentProfiles.userId, user.id));
  if (!profile) throw new AppError("Complete your profile first.");
  const payment = await getDb().transaction(async (tx) => {
    const fee = await lockFee(tx, feeDueId);
    if (fee.userId !== user.id) throw new AppError("Fee not found.", 404);
    await expireProviderAttempts(user.id, tx, fee.id);
    const amount = await feeBalance(tx, fee);
    if (amount === 0) throw new AppError("This fee is already paid.");
    const [existing] = await tx
      .select()
      .from(payments)
      .where(
        and(eq(payments.feeDueId, fee.id), eq(payments.status, "pending")),
      );
    if (existing) {
      if (existing.method === "manual_upi") {
        throw new AppError("Your screenshot is awaiting verification.", 409);
      }
      // Supersede previous uncompleted Cashfree attempt so fee has no stuck pending record
      await tx
        .update(payments)
        .set({
          status: "failed",
          attemptStatus: "abandoned",
          reviewNote: "Superseded by new checkout attempt.",
        })
        .where(eq(payments.id, existing.id));
    }
    const id = crypto.randomUUID();
    const orderId = `apna_${id.replace(/-/g, "")}`;
    // Cashfree expects order_amount in rupees (not paise)
    const orderAmountRupees = amount / 100;
    const returnUrl = `${requiredEnv("BETTER_AUTH_URL")}/payment-status?order_id={order_id}`;
    const digitsOnly = (profile.phone || "").replace(/\D/g, "");
    const customerPhone = /^[6-9]\d{9}$/.test(digitsOnly)
      ? digitsOnly
      : digitsOnly.length >= 10
        ? digitsOnly.slice(-10)
        : "9999999999";

    const order = await createOrder({
      order_id: orderId,
      order_amount: orderAmountRupees,
      order_currency: "INR",
      customer_details: {
        customer_id: user.id.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 50),
        customer_phone: customerPhone,
        customer_email: user.email,
        customer_name: profile.fullName || "Student",
      },
      order_meta: { return_url: returnUrl },
    });
    if (order.order_currency !== "INR")
      throw new AppError("Could not create the correct payment order.", 502);
    const [record] = await tx
      .insert(payments)
      .values({
        id,
        userId: user.id,
        feeDueId: fee.id,
        amount,
        method: "cashfree",
        attemptStatus: "checkout_started",
        cashfreeOrderId: order.order_id,
      })
      .returning();
    return { ...record, paymentSessionId: order.payment_session_id };
  });
  return Response.json({
    paymentSessionId: "paymentSessionId" in payment ? payment.paymentSessionId : undefined,
    orderId: payment.cashfreeOrderId,
    amount: payment.amount,
    expiresAt: new Date(
      payment.createdAt.getTime() + 15 * 60 * 1000,
    ).toISOString(),
    name: profile.fullName,
    email: user.email,
    phone: profile.phone,
  });
});
