import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { publicOrigin, requiredEnv } from "./env";
import { AppError } from "./errors";

const API_URL = "https://api.cashfree.com/pg";
const API_VERSION = "2026-01-01";

export class CashfreeApiError extends AppError {
  constructor(public providerStatus: number) {
    super("Payment provider is unavailable. Please try again shortly.", 502);
  }
}

async function api(
  path: string,
  method: "GET" | "POST" | "PATCH" = "GET",
  body?: object,
  idempotencyKey?: string,
) {
  const response = await fetch(`${API_URL}/${path}`, {
    method,
    headers: {
      "x-client-id": requiredEnv("CASHFREE_APP_ID"),
      "x-client-secret": requiredEnv("CASHFREE_SECRET_KEY"),
      "x-api-version": API_VERSION,
      "Content-Type": "application/json",
      ...(idempotencyKey ? { "x-idempotency-key": idempotencyKey } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) {
    const errorDetails = await response.text().catch(() => "");
    console.error("[Cashfree] API request failed", {
      method,
      status: response.status,
      errorDetails,
    });
    throw new CashfreeApiError(response.status);
  }
  return response.json();
}

export function cashfreeCallbackUrls() {
  const origin = publicOrigin(true);
  return {
    return_url: `${origin}/student/history?order_id={order_id}`,
    notify_url: `${origin}/api/cashfree/webhook`,
  };
}

export function validWebhookSignature(
  timestamp: string,
  rawBody: string | Buffer,
  signature: string,
  secret: string,
) {
  if (!/^\d+$/.test(timestamp) || !/^[A-Za-z0-9+/]{43}=$/.test(signature))
    return false;
  // Two updates concatenate the timestamp and exact bytes without decoding JSON.
  const expected = createHmac("sha256", secret)
    .update(timestamp)
    .update(rawBody)
    .digest();
  const supplied = Buffer.from(signature, "base64");
  return (
    supplied.length === expected.length && timingSafeEqual(expected, supplied)
  );
}

export type CustomerDetails = {
  customer_id: string;
  customer_phone: string;
  customer_email: string;
  customer_name: string;
};

const providerId = z
  .union([
    z.string().min(1),
    z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  ])
  .transform(String);

const orderSchema = z.object({
  cf_order_id: providerId,
  order_id: z.string().min(1),
  payment_session_id: z.string().min(1).nullish(),
  order_status: z.string(),
  order_amount: z.number().positive(),
  order_currency: z.string(),
  order_expiry_time: z.string().optional(),
});
export type CashfreeOrder = z.infer<typeof orderSchema>;

export async function createOrder(
  params: {
    order_id: string;
    order_amount: number;
    order_currency: string;
    customer_details: CustomerDetails;
    order_expiry_time: string;
    order_meta: { return_url: string; notify_url: string };
  },
  idempotencyKey: string,
): Promise<CashfreeOrder> {
  return orderSchema.parse(await api("orders", "POST", params, idempotencyKey));
}

export async function fetchOrder(orderId: string) {
  return orderSchema.parse(await api(`orders/${encodeURIComponent(orderId)}`));
}

export async function terminateOrder(orderId: string) {
  return orderSchema.parse(
    await api(`orders/${encodeURIComponent(orderId)}`, "PATCH", {
      order_status: "TERMINATED",
    }),
  );
}

const paymentSchema = z.object({
  cf_payment_id: providerId,
  // The Get Payments for an Order response does not always include order_id.
  order_id: z.string().optional(),
  payment_amount: z.number().nonnegative(),
  payment_currency: z.string(),
  payment_status: z.string(),
  payment_time: z.string().nullish(),
});

export type ProviderPayment = {
  id: string;
  order_id: string;
  amount: number;
  currency: string;
  status: string;
  time?: string | null;
};

export async function fetchOrderPayments(
  orderId: string,
): Promise<ProviderPayment[]> {
  const items = z
    .array(paymentSchema)
    .parse(await api(`orders/${encodeURIComponent(orderId)}/payments`));
  return items.map((raw) => {
    if (raw.order_id && raw.order_id !== orderId) {
      throw new AppError("Payment does not match the requested order.", 502);
    }
    return {
      id: raw.cf_payment_id,
      order_id: orderId,
      amount: Math.round(raw.payment_amount * 100),
      currency: raw.payment_currency,
      status: raw.payment_status,
      time: raw.payment_time,
    };
  });
}
