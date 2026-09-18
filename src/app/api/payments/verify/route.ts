import { rateLimit } from "@/lib/rate-limit";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { payments } from "@/db/schema";
import { requireUser } from "@/lib/access";
import { AppError } from "@/lib/errors";
import { jsonBody, mutation } from "@/lib/http";
import { fetchOrder, fetchOrderPayments } from "@/lib/cashfree";
import { settleProviderPayment } from "@/lib/ledger";
export const POST = mutation(async (req) => {
  const user = await requireUser();
  await rateLimit(user.id, "payments/verify", 20);
  const body = z
    .object({
      order_id: z.string().max(100),
    })
    .parse(await jsonBody(req));
  const [record] = await getDb()
    .select()
    .from(payments)
    .where(eq(payments.cashfreeOrderId, body.order_id));
  if (!record || record.userId !== user.id)
    throw new AppError("Payment not found.", 404);
  // Query Cashfree for authoritative order status
  const order = await fetchOrder(body.order_id);
  if (order.order_status !== "PAID")
    throw new AppError("Payment has not been completed yet.", 400);
  // Fetch the successful payment attempt
  const attempts = await fetchOrderPayments(body.order_id);
  const captured = attempts.find((p) => p.status === "SUCCESS");
  if (!captured)
    throw new AppError("No successful payment found for this order.", 400);
  const payment = await settleProviderPayment(captured);
  return Response.json({ status: payment.status, id: payment.id });
});
