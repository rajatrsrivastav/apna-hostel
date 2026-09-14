import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { requiredEnv } from "./env";
import { AppError } from "./errors";
export function validSignature(
  body: string | Buffer,
  signature: string,
  secret: string,
) {
  if (!/^[a-f0-9]{64}$/i.test(signature)) return false;
  return timingSafeEqual(
    createHmac("sha256", secret).update(body).digest(),
    Buffer.from(signature, "hex"),
  );
}
const paymentSchema = z.object({
  id: z.string(),
  order_id: z.string(),
  amount: z.number().int(),
  currency: z.string(),
  status: z.string(),
  captured: z.boolean().optional(),
});
export type ProviderPayment = z.infer<typeof paymentSchema>;
async function api(path: string, body?: object) {
  const response = await fetch(`https://api.razorpay.com/v1/${path}`, {
    method: body ? "POST" : "GET",
    headers: {
      Authorization: `Basic ${Buffer.from(`${requiredEnv("RAZORPAY_KEY_ID")}:${requiredEnv("RAZORPAY_KEY_SECRET")}`).toString("base64")}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok)
    throw new AppError(
      "Payment provider is unavailable. Please try again shortly.",
      502,
    );
  return response.json();
}
export async function createOrder(amount: number, receipt: string) {
  return z
    .object({ id: z.string(), amount: z.number(), currency: z.string() })
    .parse(await api("orders", { amount, currency: "INR", receipt }));
}
export async function fetchPayment(id: string) {
  if (!/^pay_[a-zA-Z0-9]+$/.test(id)) throw new AppError("Invalid payment ID.");
  return paymentSchema.parse(await api(`payments/${id}`));
}
export async function fetchOrderPayments(id: string) {
  if (!/^order_[a-zA-Z0-9]+$/.test(id)) throw new AppError("Invalid order ID.");
  return z
    .object({ items: z.array(paymentSchema) })
    .parse(await api(`orders/${id}/payments`)).items;
}
