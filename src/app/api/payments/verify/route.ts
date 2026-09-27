import { rateLimit } from "@/lib/rate-limit";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { payments } from "@/db/schema";
import { requireUser } from "@/lib/access";
import { AppError } from "@/lib/errors";
import { jsonBody, mutation } from "@/lib/http";
import { reconcileCashfreeCheckout } from "@/lib/payment-verification";
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
  const { payment, state } = await reconcileCashfreeCheckout(order_id);
  const retrySafe = state === "retry";
  return Response.json({
    retrySafe,
    state,
    attemptStatus: payment.attemptStatus,
    status: payment.status,
    id: payment.id,
    paid: payment.attemptStatus === "paid",
    message:
      payment.attemptStatus === "paid" && payment.status !== "verified"
        ? "Payment received. The office must review it because your fee balance changed. Please do not pay again."
        : payment.status === "verified"
          ? "Payment verified."
          : state === "retry"
            ? "Payment was not completed. You can pay again."
            : state === "closing"
              ? "Your previous checkout is closing. We are checking when you can retry."
              : "Cashfree is confirming a bank payment. Please wait before paying again.",
  });
});
