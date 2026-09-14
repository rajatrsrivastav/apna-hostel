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
import { createOrder } from "@/lib/razorpay";
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
      if (existing.method === "manual_upi")
        throw new AppError("Your screenshot is awaiting verification.", 409);
      return existing;
    }
    const id = crypto.randomUUID();
    const order = await createOrder(amount, id);
    if (order.amount !== amount || order.currency !== "INR")
      throw new AppError("Could not create the correct payment order.", 502);
    const [record] = await tx
      .insert(payments)
      .values({
        id,
        userId: user.id,
        feeDueId: fee.id,
        amount,
        method: "razorpay",
        attemptStatus: "checkout_started",
        razorpayOrderId: order.id,
      })
      .returning();
    return record;
  });
  return Response.json({
    key: requiredEnv("RAZORPAY_KEY_ID"),
    orderId: payment.razorpayOrderId,
    amount: payment.amount,
    expiresAt: new Date(
      payment.createdAt.getTime() + 15 * 60 * 1000,
    ).toISOString(),
    name: profile.fullName,
    email: user.email,
    phone: profile.phone,
  });
});
