import crypto from "node:crypto";
import { z } from "zod";
import { requiredEnv } from "@/lib/env";
import { fetchOrder, fetchOrderPayments } from "@/lib/cashfree";
import { settleProviderPayment } from "@/lib/ledger";
import { limitedBody } from "@/lib/http";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const rawBodyBuffer = await limitedBody(req, 256 * 1024);
    const rawBody = rawBodyBuffer.toString("utf8");

    const timestamp = req.headers.get("x-webhook-timestamp") ?? "";
    const signature = req.headers.get("x-webhook-signature") ?? "";

    // The user explicitly requested to use CASHFREE_SECRET_KEY for signature verification
    const secret = requiredEnv("CASHFREE_SECRET_KEY");
    const generatedSignature = crypto
      .createHmac("sha256", secret)
      .update(timestamp + rawBody)
      .digest("base64");

    if (generatedSignature !== signature) {
      return new Response("Invalid signature", { status: 400 });
    }

    // Parse the payload
    let event;
    try {
      event = JSON.parse(rawBody);
    } catch {
      return new Response("Invalid JSON payload", { status: 400 });
    }

    // The test webhook might not have the full order data structure, 
    // so we return 200 OK immediately if it's a test or unhandled event type
    const eventType = event.type || event.event_type;
    
    if (
      eventType !== "PAYMENT_SUCCESS_WEBHOOK" &&
      eventType !== "PAYMENT_FAILED_WEBHOOK"
    ) {
      // e.g., TEST_WEBHOOK
      return new Response(JSON.stringify({ received: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // We process the webhook asynchronously or safely catching errors so we don't fail the 200 OK
    // if the payload is malformed in a way we don't expect.
    try {
      const payload = z
        .object({
          order: z.object({ order_id: z.string() }),
        })
        .parse(event.data);

      const orderId = payload.order.order_id;
      
      // Pull authoritative state from Cashfree and settle via the ledger
      await fetchOrder(orderId);
      const attempts = await fetchOrderPayments(orderId);

      if (eventType === "PAYMENT_FAILED_WEBHOOK") {
        const current =
          attempts.find((p) => p.status === "SUCCESS") ||
          attempts.find((p) => p.status === "PENDING") ||
          attempts.find((p) => p.status === "FAILED");

        if (current) {
          await settleProviderPayment(current);
        }
      } else if (eventType === "PAYMENT_SUCCESS_WEBHOOK") {
        const success = attempts.find((p) => p.status === "SUCCESS");
        if (success) {
          await settleProviderPayment(success);
        }
      }
    } catch (err) {
      console.error("[Cashfree Webhook] Error processing event:", err);
      // We still return 200 so Cashfree doesn't disable the webhook, 
      // but we log the error for debugging.
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[Cashfree Webhook] Fatal error:", error);
    return new Response("Internal Server Error", { status: 500 });
  }
}
