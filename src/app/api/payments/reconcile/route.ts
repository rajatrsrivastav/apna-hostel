import { rateLimit } from "@/lib/rate-limit";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { payments } from "@/db/schema";
import { requireUser } from "@/lib/access";
import { AppError } from "@/lib/errors";
import { jsonBody, mutation } from "@/lib/http";
import { idSchema } from "@/lib/validation";
import { fetchOrderPayments } from "@/lib/razorpay";
import { expireProviderAttempts, settleProviderPayment } from "@/lib/ledger";
export const POST = mutation(async (req) => {
  const user = await requireUser();
  await rateLimit(user.id, "payments/reconcile", 20);
  const { paymentId } = z
    .object({ paymentId: idSchema })
    .parse(await jsonBody(req));
  await expireProviderAttempts(user.id);
  const [record] = await getDb()
    .select()
    .from(payments)
    .where(eq(payments.id, paymentId));
  if (!record || (record.userId !== user.id && user.role !== "admin"))
    throw new AppError("Payment not found.", 404);
  if (!record.razorpayOrderId)
    throw new AppError("This is not an online payment.");
  const attempts = await fetchOrderPayments(record.razorpayOrderId);
  const captured = attempts.find((p) => p.status === "captured");
  if (captured) {
    const updated = await settleProviderPayment(captured);
    return Response.json({ status: updated.status });
  }
  const failed = attempts.find((p) => p.status === "failed");
  if (failed && !attempts.some((p) => p.status === "authorized")) {
    const updated = await settleProviderPayment(failed);
    return Response.json({
      status: updated.status,
      message: "Payment failed. You can try paying again.",
    });
  }
  return Response.json({
    status: record.status,
    message:
      "No completed payment yet. You can retry the same checkout safely.",
  });
});
