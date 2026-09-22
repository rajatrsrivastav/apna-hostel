import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { payments } from "@/db/schema";
import { requireUser } from "@/lib/access";
import { AppError } from "@/lib/errors";
import { jsonBody, mutation } from "@/lib/http";
import { verifyCashfreePayment } from "@/lib/payment-verification";

// Closing a browser is not proof that a bank payment was cancelled.
export const POST = mutation(async (req) => {
  const user = await requireUser();
  const { orderId } = z
    .object({ orderId: z.string().min(1).max(100) })
    .parse(await jsonBody(req));
  const [record] = await getDb()
    .select()
    .from(payments)
    .where(
      and(eq(payments.cashfreeOrderId, orderId), eq(payments.userId, user.id)),
    );
  if (!record) throw new AppError("Payment not found.", 404);
  const payment = await verifyCashfreePayment(orderId);
  return Response.json({ status: payment.attemptStatus ?? payment.status });
});
