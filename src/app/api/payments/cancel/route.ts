import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { payments } from "@/db/schema";
import { requireUser } from "@/lib/access";
import { AppError } from "@/lib/errors";
import { jsonBody, mutation } from "@/lib/http";
import { closeAbandonedCashfreeCheckout } from "@/lib/payment-verification";

// Reconcile with Cashfree before abandoning a checkout; a browser close alone
// is never treated as proof that the bank payment failed.
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
  const result = await closeAbandonedCashfreeCheckout(orderId);
  return Response.json({ status: result.state });
});
