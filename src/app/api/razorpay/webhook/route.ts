import { z } from "zod";
import { errorResponse, AppError } from "@/lib/errors";
import { requiredEnv } from "@/lib/env";
import { limitedBody } from "@/lib/http";
import {
  fetchPayment,
  fetchOrderPayments,
  validSignature,
} from "@/lib/razorpay";
import { settleProviderPayment } from "@/lib/ledger";
export const runtime = "nodejs";
export async function POST(req: Request) {
  try {
    const raw = await limitedBody(req, 256 * 1024);
    const signature = req.headers.get("x-razorpay-signature") ?? "";
    if (!validSignature(raw, signature, requiredEnv("RAZORPAY_WEBHOOK_SECRET")))
      throw new AppError("Invalid webhook signature.", 400);
    const event = z
      .object({ event: z.string(), payload: z.unknown() })
      .parse(JSON.parse(raw.toString("utf8")));
    if (
      event.event !== "payment.captured" &&
      event.event !== "order.paid" &&
      event.event !== "payment.failed"
    )
      return Response.json({ received: true });
    const payload = z
      .object({ payment: z.object({ entity: z.object({ id: z.string() }) }) })
      .parse(event.payload);
    // Read current provider state rather than trusting stale webhook event order.
    const provider = await fetchPayment(payload.payment.entity.id);
    if (event.event === "payment.failed") {
      const attempts = await fetchOrderPayments(provider.order_id);
      const current =
        attempts.find((p) => p.status === "captured") ||
        attempts.find((p) => p.status === "authorized") ||
        provider;
      await settleProviderPayment(current);
    } else await settleProviderPayment(provider);
    return Response.json({ received: true });
  } catch (e) {
    return errorResponse(e);
  }
}
