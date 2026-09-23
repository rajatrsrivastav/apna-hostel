import { rateLimit } from "@/lib/rate-limit";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { payments } from "@/db/schema";
import { requireUser } from "@/lib/access";
import { AppError } from "@/lib/errors";
import { jsonBody, mutation } from "@/lib/http";
import { idSchema } from "@/lib/validation";
import { verifyCashfreePayment } from "@/lib/payment-verification";
import { fetchOrder, fetchOrderPayments } from "@/lib/cashfree";
export const POST = mutation(async (req) => {
  const user = await requireUser();
  await rateLimit(user.id, "payments/reconcile", 20);
  const { paymentId } = z
    .object({ paymentId: idSchema })
    .parse(await jsonBody(req));
  const [record] = await getDb()
    .select()
    .from(payments)
    .where(eq(payments.id, paymentId));
  if (!record || (record.userId !== user.id && user.role !== "admin"))
    throw new AppError("Payment not found.", 404);
  if (!record.cashfreeOrderId)
    throw new AppError("This is not an online payment.");
  const payment = await verifyCashfreePayment(record.cashfreeOrderId);
  const order = await fetchOrder(record.cashfreeOrderId);
  const attempts = await fetchOrderPayments(record.cashfreeOrderId);
  const retrySafe = ["EXPIRED", "TERMINATED"].includes(order.order_status) &&
    !attempts.some((attempt) => ["SUCCESS", "PENDING"].includes(attempt.status)) &&
    payment.attemptStatus !== "paid" && payment.status !== "verified";
  return Response.json({
    retrySafe,
    status: payment.status,
    message:
      payment.attemptStatus === "paid"
        ? payment.status === "verified"
          ? "Payment verified."
          : "Payment received; office review required. Please do not pay again."
        : "Payment is not confirmed yet. Check again before making another payment.",
  });
});
