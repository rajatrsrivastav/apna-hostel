import { rateLimit } from "@/lib/rate-limit";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { payments } from "@/db/schema";
import { requireUser } from "@/lib/access";
import { AppError } from "@/lib/errors";
import { jsonBody, mutation } from "@/lib/http";
import { idSchema } from "@/lib/validation";
import { reconcileCashfreeCheckout } from "@/lib/payment-verification";
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
  const { payment, state } = await reconcileCashfreeCheckout(
    record.cashfreeOrderId,
  );
  const retrySafe = state === "retry";
  return Response.json({
    retrySafe,
    state,
    status: payment.status,
    message:
      payment.attemptStatus === "paid"
        ? payment.status === "verified"
          ? "Payment verified."
          : "Payment received; office review required. Please do not pay again."
        : state === "retry"
          ? "Payment was not completed. You can pay again."
          : state === "closing"
            ? "Your previous checkout is closing. We are checking when you can retry."
            : "Cashfree is confirming a bank payment. Please wait before paying again.",
  });
});
