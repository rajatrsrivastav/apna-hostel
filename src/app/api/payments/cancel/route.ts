import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { payments } from "@/db/schema";
import { requireUser } from "@/lib/access";
import { AppError } from "@/lib/errors";
import { jsonBody, mutation } from "@/lib/http";
import { expireProviderAttempts, lockFee } from "@/lib/ledger";
import { notifyPaymentIncomplete } from "@/lib/notifications";
export const POST = mutation(async (req) => {
  const user = await requireUser();
  const { orderId } = z
    .object({
      orderId: z.string().min(1).max(100),
    })
    .parse(await jsonBody(req));
  const [record] = await getDb()
    .select()
    .from(payments)
    .where(
      and(eq(payments.cashfreeOrderId, orderId), eq(payments.userId, user.id)),
    );
  if (!record) throw new AppError("Payment not found.", 404);
  const payment = await getDb().transaction(async (tx) => {
    await lockFee(tx, record.feeDueId);
    await expireProviderAttempts(user.id, tx, record.feeDueId);
    await tx
      .update(payments)
      .set({
        status: "failed",
        attemptStatus: "cancelled",
        reviewNote: "Payment cancelled. You can try again.",
      })
      .where(and(eq(payments.id, record.id), eq(payments.status, "pending")));
    return (
      await tx.select().from(payments).where(eq(payments.id, record.id))
    )[0];
  });
  if (payment.attemptStatus === "cancelled") {
    try {
      await notifyPaymentIncomplete(record.id, "cancelled");
    } catch (err) {
      console.error("[Notification] notifyPaymentIncomplete failed:", err);
    }
  }
  return Response.json({ status: payment.attemptStatus ?? payment.status });
});
