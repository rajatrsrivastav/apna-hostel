import { createHmac } from "node:crypto";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  expect,
  it,
  vi,
} from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { eq } from "drizzle-orm";
import * as schema from "@/db/schema";

const shared = vi.hoisted(() => ({
  db: undefined as unknown,
  userId: "student-payment-test",
}));
vi.mock("@/db", () => ({ getDb: () => shared.db }));
vi.mock("@/lib/access", () => ({
  requireUser: async () => ({
    id: shared.userId,
    email: "student@example.test",
    role: "student",
  }),
}));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: vi.fn() }));
vi.mock("@/lib/notifications", () => ({
  notifyPaymentSuccess: vi.fn(),
  notifyPaymentIncomplete: vi.fn(),
}));
import { notifyPaymentSuccess } from "@/lib/notifications";
import {
  validWebhookSignature,
  fetchOrderPayments,
  cashfreeCallbackUrls,
} from "@/lib/cashfree";
import { verifyCashfreePayment } from "@/lib/payment-verification";
import { POST as webhook } from "@/app/api/cashfree/webhook/route";
import { POST as create } from "@/app/api/payments/order/route";
import { POST as verify } from "@/app/api/payments/verify/route";

let client: PGlite;
let db: ReturnType<typeof drizzle<typeof schema>>;
const feeId = "717e70f5-d78d-434d-886e-df9c98dbdceb";
const paymentId = "f9b90778-5351-48ac-97fb-0bd17ce6aafb";
const orderId = "apna_known_order";
const secret = "isolated-test-secret-not-a-production-credential";
let fetchMock: ReturnType<typeof vi.fn>;
let providerOrder: Record<string, unknown>;
let providerPayments: Record<string, unknown>[];

beforeAll(async () => {
  client = new PGlite();
  db = drizzle(client, { schema });
  shared.db = db;
  await migrate(db, { migrationsFolder: "./drizzle" });
});
afterAll(async () => {
  await client.close();
});
beforeEach(async () => {
  vi.clearAllMocks();
  vi.stubEnv("CASHFREE_APP_ID", "isolated-test-app-id");
  vi.stubEnv("CASHFREE_SECRET_KEY", secret);
  vi.stubEnv("BETTER_AUTH_URL", "https://portal.example.test");
  shared.userId = "student-payment-test";
  await db.delete(schema.payments);
  await db.delete(schema.feeDues);
  await db.delete(schema.studentProfiles);
  await db.delete(schema.users);
  await db
    .insert(schema.users)
    .values({ id: shared.userId, name: "Test", email: "student@example.test" });
  await db.insert(schema.studentProfiles).values({
    userId: shared.userId,
    fullName: "Test Student",
    phone: "9876543210",
    course: "ITI",
    trade: "Test",
    studyYear: "1",
  });
  await db.insert(schema.feeDues).values({
    id: feeId,
    userId: shared.userId,
    label: "Rent",
    amount: 10000,
    dueDate: "2026-10-01",
  });
  providerOrder = {
    cf_order_id: "999",
    order_id: orderId,
    order_status: "ACTIVE",
    order_amount: 100,
    order_currency: "INR",
    payment_session_id: "session_test",
  };
  providerPayments = [];
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    expect(url).toMatch(/^https:\/\/api\.cashfree\.com\/pg\//);
    expect(new Headers(init?.headers).get("x-api-version")).toBe("2026-01-01");
    return Response.json(
      url.endsWith("/payments") ? providerPayments : providerOrder,
    );
  });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

async function reserve() {
  await db.insert(schema.payments).values({
    id: paymentId,
    userId: shared.userId,
    feeDueId: feeId,
    amount: 10000,
    method: "cashfree",
    cashfreeOrderId: orderId,
    attemptStatus: "checkout_started",
  });
}
function success(amount = 100) {
  providerOrder.order_status = "PAID";
  // Official payments response can omit order_id.
  providerPayments = [
    {
      cf_payment_id: "9001",
      payment_amount: amount,
      payment_currency: "INR",
      payment_status: "SUCCESS",
    },
  ];
}
function signed(body: string, signature?: string) {
  const timestamp = "1770000000000";
  return new Request("https://portal.example.test/api/cashfree/webhook", {
    method: "POST",
    body,
    headers: {
      "x-webhook-timestamp": timestamp,
      "x-webhook-signature":
        signature ??
        createHmac("sha256", secret)
          .update(timestamp)
          .update(body)
          .digest("base64"),
    },
  });
}
function event(type = "PAYMENT_SUCCESS_WEBHOOK", order = orderId) {
  return JSON.stringify({ type, data: { order: { order_id: order } } });
}
function mutation(path: string, body: object) {
  return new Request(`https://portal.example.test${path}`, {
    method: "POST",
    headers: {
      origin: "https://portal.example.test",
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}
async function record() {
  return (
    await db
      .select()
      .from(schema.payments)
      .where(eq(schema.payments.id, paymentId))
  )[0];
}

it("verifies raw bytes including whitespace, decimals and Unicode, and rejects altered or missing headers", () => {
  const body = '{ "amount": 100.00, "name": "नमस्ते" }\n';
  const timestamp = "1770000000000";
  const sig = createHmac("sha256", secret)
    .update(timestamp)
    .update(body)
    .digest("base64");
  expect(validWebhookSignature(timestamp, Buffer.from(body), sig, secret)).toBe(
    true,
  );
  expect(
    validWebhookSignature(
      timestamp,
      JSON.stringify(JSON.parse(body)),
      sig,
      secret,
    ),
  ).toBe(false);
  expect(validWebhookSignature("", body, sig, secret)).toBe(false);
  expect(validWebhookSignature(timestamp, body, "é".repeat(44), secret)).toBe(
    false,
  );
});
it("acknowledges signed dashboard probes and sample payments without changing records", async () => {
  expect(
    (
      await webhook(
        signed(
          '{"type":"WEBHOOK","data":{"test_object":{"test_key":"test_value"}}}',
        ),
      )
    ).status,
  ).toBe(200);
  expect(
    (
      await webhook(
        signed(event("PAYMENT_SUCCESS_WEBHOOK", "dashboard_sample")),
      )
    ).status,
  ).toBe(200);
  expect(fetchMock).not.toHaveBeenCalled();
  expect(await db.select().from(schema.payments)).toHaveLength(0);
});
it("rejects invalid signatures before parsing, invalid JSON after verification, and oversized payloads", async () => {
  expect((await webhook(signed("not JSON", "bad"))).status).toBe(401);
  expect((await webhook(signed("not JSON"))).status).toBe(400);
  expect((await webhook(signed(" ".repeat(256 * 1024 + 1)))).status).toBe(413);
  expect(fetchMock).not.toHaveBeenCalled();
});
it("settles concurrent duplicate successes once and never demotes a capture on a late failure", async () => {
  await reserve();
  success();
  const responses = await Promise.all([
    webhook(signed(event())),
    webhook(signed(event())),
  ]);
  expect(responses.map((r) => r.status)).toEqual([200, 200]);
  expect((await record()).status).toBe("verified");
  expect((await record()).cashfreePaymentId).toBe("9001");
  expect(notifyPaymentSuccess).toHaveBeenCalledTimes(1);
  providerOrder.order_status = "ACTIVE";
  providerPayments = [
    {
      cf_payment_id: "9000",
      payment_amount: 100,
      payment_currency: "INR",
      payment_status: "FAILED",
    },
  ];
  expect((await webhook(signed(event("PAYMENT_FAILED_WEBHOOK")))).status).toBe(
    200,
  );
  expect((await record()).status).toBe("verified");
});
it("returns retryable failure on provider outage and accepts the eventual retry", async () => {
  await reserve();
  success();
  fetchMock.mockRejectedValueOnce(new Error("timeout"));
  expect((await webhook(signed(event()))).status).toBe(503);
  expect((await record()).status).toBe("pending");
  expect((await webhook(signed(event()))).status).toBe(200);
});
it("does not acknowledge a success before Cashfree confirms PAID and SUCCESS", async () => {
  await reserve();
  expect((await webhook(signed(event()))).status).toBe(503);
  success();
  providerOrder.order_status = "ACTIVE";
  expect((await webhook(signed(event()))).status).toBe(503);
  expect((await record()).status).toBe("pending");
});
it("rejects order/payment amount, currency and identity mismatches", async () => {
  await reserve();
  success(99);
  await expect(verifyCashfreePayment(orderId)).rejects.toThrow("amount");
  success();
  providerOrder.order_currency = "USD";
  await expect(verifyCashfreePayment(orderId)).rejects.toThrow("details");
  providerOrder.order_currency = "INR";
  providerOrder.order_amount = 99;
  await expect(verifyCashfreePayment(orderId)).rejects.toThrow("details");
  providerOrder.order_amount = 100;
  providerOrder.order_id = "other";
  await expect(verifyCashfreePayment(orderId)).rejects.toThrow("details");
  providerOrder.order_id = orderId;
  providerPayments[0].order_id = "other";
  await expect(verifyCashfreePayment(orderId)).rejects.toThrow(
    "requested order",
  );
  expect((await record()).status).toBe("pending");
});
it("maps order-scoped payment responses without requiring an undocumented order_id field", async () => {
  success();
  expect(await fetchOrderPayments(orderId)).toMatchObject([
    { id: "9001", order_id: orderId, amount: 10000, status: "SUCCESS" },
  ]);
});
it("handles failed and dropped attempts, then credits a later success on the same order", async () => {
  await reserve();
  providerPayments = [
    {
      cf_payment_id: "9000",
      payment_amount: 100,
      payment_currency: "INR",
      payment_status: "USER_DROPPED",
    },
  ];
  expect(
    (await webhook(signed(event("PAYMENT_USER_DROPPED_WEBHOOK")))).status,
  ).toBe(200);
  expect((await record()).attemptStatus).toBe("cancelled");
  success();
  expect((await webhook(signed(event()))).status).toBe(200);
  expect((await record()).status).toBe("verified");
});
it("preserves pending status on the return URL and denies another student's verification", async () => {
  await reserve();
  const response = await verify(
    mutation("/api/payments/verify", { order_id: orderId }),
  );
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({
    status: "pending",
    paid: false,
  });
  expect((await record()).status).toBe("pending");
  shared.userId = "other-user";
  expect(
    (await verify(mutation("/api/payments/verify", { order_id: orderId })))
      .status,
  ).toBe(404);
});
it("keeps excess captures for review and does not credit a fee twice", async () => {
  await reserve();
  await db.insert(schema.payments).values({
    id: "already-paid",
    userId: shared.userId,
    feeDueId: feeId,
    amount: 10000,
    method: "admin_manual",
    status: "verified",
  });
  success();
  expect((await webhook(signed(event()))).status).toBe(200);
  expect(await record()).toMatchObject({
    status: "rejected",
    attemptStatus: "paid",
  });
  expect(notifyPaymentSuccess).not.toHaveBeenCalled();
  const response = await verify(
    mutation("/api/payments/verify", { order_id: orderId }),
  );
  expect(await response.json()).toMatchObject({
    status: "rejected",
    paid: true,
  });
});
it("creates a durable server-side order with production callbacks and a stable key, then reuses it", async () => {
  let persistedId = "";
  fetchMock.mockImplementation(async (_url: string, init: RequestInit) => {
    if (init.method === "POST") {
      const body = JSON.parse(String(init.body));
      const [local] = await db.select().from(schema.payments);
      expect(local.cashfreeOrderId).toBe(body.order_id);
      persistedId = local.id;
      expect(new Headers(init.headers).get("x-idempotency-key")).toBe(local.id);
      expect(body.order_amount).toBe(100);
      expect(body.order_meta).toEqual({
        return_url:
          "https://portal.example.test/student/payment-status?order_id={order_id}",
        notify_url: "https://portal.example.test/api/cashfree/webhook",
      });
      providerOrder.order_id = body.order_id;
    }
    return Response.json(providerOrder);
  });
  const first = await create(
    mutation("/api/payments/order", { feeDueId: feeId, amount: 1 }),
  );
  expect(first.status).toBe(200);
  const body = await first.json();
  expect(body).toMatchObject({
    payment_session_id: "session_test",
    amount: 10000,
  });
  expect(JSON.stringify(body)).not.toContain(secret);
  expect(
    (await create(mutation("/api/payments/order", { feeDueId: feeId }))).status,
  ).toBe(200);
  expect(await db.select().from(schema.payments)).toHaveLength(1);
  expect(
    fetchMock.mock.calls.filter(([, init]) => init.method === "POST"),
  ).toHaveLength(1);
  expect(persistedId).toBeTruthy();
});
it("recovers a timed-out order creation using the persisted reservation", async () => {
  fetchMock.mockImplementationOnce(async (_url: string, init: RequestInit) => {
    providerOrder.order_id = JSON.parse(String(init.body)).order_id;
    throw new Error("connection lost after create");
  });
  expect(
    (await create(mutation("/api/payments/order", { feeDueId: feeId }))).status,
  ).toBe(500);
  expect(await db.select().from(schema.payments)).toHaveLength(1);
  expect(
    (await create(mutation("/api/payments/order", { feeDueId: feeId }))).status,
  ).toBe(200);
  expect(await db.select().from(schema.payments)).toHaveLength(1);
});
it("requires HTTPS callbacks", async () => {
  vi.stubEnv("BETTER_AUTH_URL", "http://localhost:3000");
  expect(() => cashfreeCallbackUrls()).toThrow("HTTPS");
});

it("restores a failed attempt to pending while awaiting a later bank confirmation", async () => {
  await reserve();
  providerPayments = [
    {
      cf_payment_id: "9000",
      payment_amount: 100,
      payment_currency: "INR",
      payment_status: "FAILED",
    },
  ];
  await verifyCashfreePayment(orderId);
  expect((await record()).status).toBe("failed");
  providerPayments.push({
    cf_payment_id: "9001",
    payment_amount: 100,
    payment_currency: "INR",
    payment_status: "PENDING",
  });
  await verifyCashfreePayment(orderId);
  expect(await record()).toMatchObject({
    status: "pending",
    attemptStatus: "pending",
  });
});

it("does not replace active orders based only on local age, but allows retry after confirmed expiry", async () => {
  await reserve();
  await db
    .update(schema.payments)
    .set({ createdAt: new Date(Date.now() - 3600000) })
    .where(eq(schema.payments.id, paymentId));
  expect(
    (await create(mutation("/api/payments/order", { feeDueId: feeId }))).status,
  ).toBe(200);
  expect(await db.select().from(schema.payments)).toHaveLength(1);
  providerOrder.order_status = "EXPIRED";
  expect(
    (await create(mutation("/api/payments/order", { feeDueId: feeId }))).status,
  ).toBe(409);
  fetchMock.mockImplementationOnce(async (_url: string, init: RequestInit) =>
    Response.json({
      ...providerOrder,
      order_status: "ACTIVE",
      order_id: JSON.parse(String(init.body)).order_id,
    }),
  );
  expect(
    (await create(mutation("/api/payments/order", { feeDueId: feeId }))).status,
  ).toBe(200);
  expect(await db.select().from(schema.payments)).toHaveLength(2);
});

it("closes an expired order with only NOT_ATTEMPTED entries instead of leaving it pending forever", async () => {
  await reserve();
  providerOrder.order_status = "EXPIRED";
  providerPayments = [
    {
      cf_payment_id: "9000",
      payment_amount: 100,
      payment_currency: "INR",
      payment_status: "NOT_ATTEMPTED",
    },
  ];
  expect(await verifyCashfreePayment(orderId)).toMatchObject({
    status: "failed",
    attemptStatus: "abandoned",
  });
});

it("rejects a malformed successful provider response without a payment ID", async () => {
  await reserve();
  success();
  delete providerPayments[0].cf_payment_id;
  expect((await webhook(signed(event()))).status).toBe(503);
  expect((await record()).status).toBe("pending");
});
