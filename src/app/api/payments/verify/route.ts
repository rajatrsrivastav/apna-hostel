import { rateLimit } from "@/lib/rate-limit";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { payments } from "@/db/schema";
import { requireUser } from "@/lib/access";
import { AppError } from "@/lib/errors";
import { jsonBody, mutation } from "@/lib/http";
import { verifyCashfreePayment } from "@/lib/payment-verification";
import { fetchOrder, fetchOrderPayments } from "@/lib/cashfree";
export const POST = mutation(async (req) => {
  const user = await requireUser();
  await rateLimit(user.id, "payments/verify", 30);
  const { order_id } = z
    .object({ order_id: z.string().min(1).max(100) })
    .parse(await jsonBody(req));
  const [record] = await getDb()
    .select()
    .from(payments)
    .where(eq(payments.cashfreeOrderId, order_id));
  if (!record || record.userId !== user.id)
    throw new AppError("Payment not found.", 404);
  const payment = await verifyCashfreePayment(order_id);
  const order = await fetchOrder(order_id);
  const attempts = await fetchOrderPayments(order_id);
  const retrySafe =
    ["EXPIRED", "TERMINATED"].includes(order.order_status) &&
    !attempts.some((attempt) => ["SUCCESS", "PENDING"].includes(attempt.status)) &&
    payment.attemptStatus !== "paid" && payment.status !== "verified";
  return Response.json({
    retrySafe,
    attemptStatus: payment.attemptStatus,
    status: payment.status,
    id: payment.id,
    paid: payment.attemptStatus === "paid",
    message:
      payment.attemptStatus === "paid" && payment.status !== "verified"
        ? "Payment received. The office must review it because your fee balance changed. Please do not pay again."
        : payment.status === "verified"
          ? "Payment verified."
          : "Payment is not confirmed yet. Check again before making another payment.",
  });
});
