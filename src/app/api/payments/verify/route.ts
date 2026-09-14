import { rateLimit } from "@/lib/rate-limit";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { payments } from "@/db/schema";
import { requireUser } from "@/lib/access";
import { AppError } from "@/lib/errors";
import { jsonBody, mutation } from "@/lib/http";
import { requiredEnv } from "@/lib/env";
import { fetchPayment, validSignature } from "@/lib/razorpay";
import { settleProviderPayment } from "@/lib/ledger";
export const POST = mutation(async (req) => {
  const user = await requireUser();
  await rateLimit(user.id, "payments/verify", 20);
  const body = z
    .object({
      razorpay_order_id: z.string().max(100),
      razorpay_payment_id: z.string().max(100),
      razorpay_signature: z.string().length(64),
    })
    .parse(await jsonBody(req));
  const [record] = await getDb()
    .select()
    .from(payments)
    .where(eq(payments.razorpayOrderId, body.razorpay_order_id));
  if (!record || record.userId !== user.id)
    throw new AppError("Payment not found.", 404);
  if (
    !validSignature(
      `${record.razorpayOrderId}|${body.razorpay_payment_id}`,
      body.razorpay_signature,
      requiredEnv("RAZORPAY_KEY_SECRET"),
    )
  )
    throw new AppError("Payment verification failed.", 400);
  const provider = await fetchPayment(body.razorpay_payment_id);
  if (provider.order_id !== record.razorpayOrderId)
    throw new AppError("Payment order mismatch.", 409);
  const payment = await settleProviderPayment(provider);
  return Response.json({ status: payment.status, id: payment.id });
});
