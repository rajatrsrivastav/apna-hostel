import { z } from "zod";
import { errorResponse, AppError } from "@/lib/errors";
import { requiredEnv } from "@/lib/env";
import { limitedBody } from "@/lib/http";
import {
  fetchOrder,
  fetchOrderPayments,
  validWebhookSignature,
} from "@/lib/cashfree";
import { settleProviderPayment } from "@/lib/ledger";
export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const raw = await limitedBody(req, 256 * 1024);
    
    // Cashfree HMAC signature verification
    const timestamp = req.headers.get("x-webhook-timestamp") ?? "";
    const signature = req.headers.get("x-webhook-signature") ?? "";
    
    if (!validWebhookSignature(timestamp, raw, signature, requiredEnv("CASHFREE_WEBHOOK_SECRET"))) {
      throw new AppError("Invalid webhook signature.", 400);
    }
    
    const event = z
      .object({ type: z.string(), data: z.unknown() })
      .parse(JSON.parse(raw.toString("utf8")));
      
    // Cashfree webhook types: PAYMENT_SUCCESS_WEBHOOK, PAYMENT_FAILED_WEBHOOK
    if (
      event.type !== "PAYMENT_SUCCESS_WEBHOOK" &&
      event.type !== "PAYMENT_FAILED_WEBHOOK"
    ) {
      return Response.json({ received: true });
    }
    
    const payload = z
      .object({ 
        order: z.object({ order_id: z.string() })
      })
      .parse(event.data);
      
    // Read current provider state rather than trusting stale webhook event order.
    const order = await fetchOrder(payload.order.order_id);
    const attempts = await fetchOrderPayments(payload.order.order_id);
    
    if (event.type === "PAYMENT_FAILED_WEBHOOK") {
      const current =
        attempts.find((p) => p.status === "SUCCESS") ||
        attempts.find((p) => p.status === "PENDING") ||
        attempts.find((p) => p.status === "FAILED");
      
      if (current) {
        await settleProviderPayment(current);
      }
    } else {
      // For SUCCESS webhooks, we look for the SUCCESS attempt
      const success = attempts.find((p) => p.status === "SUCCESS");
      if (success) {
        await settleProviderPayment(success);
      }
    }
    
    return Response.json({ received: true });
  } catch (e) {
    return errorResponse(e);
  }
}
