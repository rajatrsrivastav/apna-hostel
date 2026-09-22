import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { payments } from "@/db/schema";
import { requiredEnv } from "@/lib/env";
import { validWebhookSignature } from "@/lib/cashfree";
import { verifyCashfreePayment } from "@/lib/payment-verification";
import { limitedBody } from "@/lib/http";
import { AppError } from "@/lib/errors";

export const runtime = "nodejs";
const eventSchema = z.object({
  type: z.string().optional(),
  event_type: z.string().optional(),
  data: z.unknown().optional(),
});
const paymentEvents = new Set([
  "PAYMENT_SUCCESS_WEBHOOK",
  "PAYMENT_FAILED_WEBHOOK",
  "PAYMENT_USER_DROPPED_WEBHOOK",
]);
const received = () => Response.json({ received: true });

export async function POST(req: Request) {
  try {
    const rawBody = await limitedBody(req, 256 * 1024);
    if (
      !validWebhookSignature(
        req.headers.get("x-webhook-timestamp") ?? "",
        rawBody,
        req.headers.get("x-webhook-signature") ?? "",
        requiredEnv("CASHFREE_SECRET_KEY"),
      )
    )
      return Response.json({ error: "Invalid signature" }, { status: 401 });

    let decoded: unknown;
    try {
      decoded = JSON.parse(rawBody.toString("utf8"));
    } catch {
      return Response.json({ error: "Invalid JSON" }, { status: 400 });
    }
    const parsed = eventSchema.safeParse(decoded);
    if (!parsed.success)
      return Response.json({ error: "Invalid event" }, { status: 400 });
    const event = parsed.data;
    // Cashfree dashboard connectivity probes are signed but need not be payments.
    if (!paymentEvents.has(event.type ?? event.event_type ?? ""))
      return received();
    const payload = z
      .object({ order: z.object({ order_id: z.string().min(1).max(100) }) })
      .safeParse(event.data);
    if (!payload.success)
      return Response.json({ error: "Invalid payment event" }, { status: 400 });
    const orderId = payload.data.order.order_id;
    const [record] = await getDb()
      .select({ id: payments.id })
      .from(payments)
      .where(eq(payments.cashfreeOrderId, orderId));
    // Dashboard sample payments and orders from other integrations cannot affect rent.
    // Our orders are persisted BEFORE being sent to Cashfree, so no creation race exists.
    if (!record) return received();
    const payment = await verifyCashfreePayment(orderId);
    if (
      (event.type ?? event.event_type) === "PAYMENT_SUCCESS_WEBHOOK" &&
      payment.attemptStatus !== "paid"
    ) {
      throw new AppError("Provider confirmation is not available yet.", 503);
    }
    return received();
  } catch (error) {
    if (error instanceof AppError && error.status === 413) {
      return Response.json({ error: "Request too large" }, { status: 413 });
    }
    // Do not acknowledge lost work. Cashfree can retry a DB/provider outage safely.
    console.error("[Cashfree] Webhook processing failed", {
      type: error instanceof Error ? error.name : "UnknownError",
      status: error instanceof AppError ? error.status : 500,
    });
    return Response.json(
      { error: "Unable to process payment. Retry delivery." },
      { status: 503 },
    );
  }
}
