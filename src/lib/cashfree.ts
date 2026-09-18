import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { requiredEnv } from "./env";
import { AppError } from "./errors";

function baseUrl() {
  const env = process.env.CASHFREE_ENV ?? "sandbox";
  return env === "production"
    ? "https://api.cashfree.com/pg"
    : "https://sandbox.cashfree.com/pg";
}

function headers(): Record<string, string> {
  return {
    "x-client-id": requiredEnv("CASHFREE_APP_ID"),
    "x-client-secret": requiredEnv("CASHFREE_SECRET_KEY"),
    "x-api-version": "2023-08-01",
    "Content-Type": "application/json",
  };
}

async function api(path: string, method: "GET" | "POST" = "GET", body?: object) {
  const response = await fetch(`${baseUrl()}/${path}`, {
    method,
    headers: headers(),
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    console.error(`[Cashfree] ${method} /${path} → ${response.status}:`, text);
    throw new AppError(
      "Payment provider is unavailable. Please try again shortly.",
      502,
    );
  }
  return response.json();
}

// -------------------------------------------------------------------
// Webhook signature verification
// -------------------------------------------------------------------

export function validWebhookSignature(
  timestamp: string,
  rawBody: string | Buffer,
  signature: string,
  secret: string,
) {
  const payload = timestamp + rawBody.toString();
  const expected = createHmac("sha256", secret).update(payload).digest("base64");
  if (expected.length !== signature.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}

// -------------------------------------------------------------------
// Order creation
// -------------------------------------------------------------------

export type CustomerDetails = {
  customer_id: string;
  customer_phone: string;
  customer_email: string;
  customer_name: string;
};

const createOrderSchema = z.object({
  cf_order_id: z.string(),
  order_id: z.string(),
  payment_session_id: z.string(),
  order_status: z.string(),
  order_amount: z.number(),
  order_currency: z.string(),
});

export type CashfreeOrder = z.infer<typeof createOrderSchema>;

export async function createOrder(params: {
  order_id: string;
  order_amount: number;
  order_currency: string;
  customer_details: CustomerDetails;
  order_meta?: { return_url?: string; notify_url?: string };
}): Promise<CashfreeOrder> {
  return createOrderSchema.parse(await api("orders", "POST", params));
}

// -------------------------------------------------------------------
// Order status
// -------------------------------------------------------------------

const orderStatusSchema = z.object({
  cf_order_id: z.string(),
  order_id: z.string(),
  order_status: z.string(),
  order_amount: z.number(),
  order_currency: z.string(),
});

export async function fetchOrder(orderId: string) {
  return orderStatusSchema.parse(await api(`orders/${encodeURIComponent(orderId)}`));
}

// -------------------------------------------------------------------
// Order payments (payment attempts)
// -------------------------------------------------------------------

const paymentSchema = z.object({
  cf_payment_id: z.coerce.string(),
  order_id: z.string(),
  payment_amount: z.number(),
  payment_currency: z.string(),
  payment_status: z.string(),
});

export type ProviderPayment = {
  id: string;
  order_id: string;
  amount: number;
  currency: string;
  status: string;
};

function toProviderPayment(raw: z.infer<typeof paymentSchema>): ProviderPayment {
  return {
    id: raw.cf_payment_id,
    order_id: raw.order_id,
    amount: Math.round(raw.payment_amount * 100),
    currency: raw.payment_currency,
    status: raw.payment_status,
  };
}

export async function fetchOrderPayments(orderId: string): Promise<ProviderPayment[]> {
  const data = await api(`orders/${encodeURIComponent(orderId)}/payments`);
  const items = z.array(paymentSchema).parse(data);
  return items.map(toProviderPayment);
}
