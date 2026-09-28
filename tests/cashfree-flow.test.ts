import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { eq } from "drizzle-orm";
import { createHmac } from "node:crypto";
import * as schema from "@/db/schema";

const state = vi.hoisted(() => ({
  db: undefined as unknown,
  user: undefined as unknown,
  orders: new Map<
    string,
    {
      order_id: string;
      order_status: string;
      order_amount: number;
      order_currency: string;
      payment_session_id: string;
      order_expiry_time: string;
      cf_order_id: string;
    }
  >(),
  attempts: new Map<
    string,
    {
      id: string;
      order_id: string;
      amount: number;
      currency: string;
      status: string;
      time: string;
    }[]
  >(),
  creates: 0,
  terminates: 0,
  loseCreateResponse: false,
  offline: false,
}));
vi.mock("@/db", () => ({ getDb: () => state.db }));
vi.mock("@/lib/access", () => ({ requireUser: async () => state.user }));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: async () => undefined }));
vi.mock("@/lib/fee-policy", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/fee-policy")>(),
  collectionStarted: () => true,
}));
vi.mock("@/lib/notifications", () => ({
  notifyPaymentSuccess: async () => undefined,
  notifyPaymentIncomplete: async () => undefined,
}));
vi.mock("@/lib/cashfree", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/cashfree")>();
  const { CashfreeApiError } = actual;
  const get = (id: string) => {
    if (state.offline) throw new Error("network unavailable");
    const order = state.orders.get(id);
    if (!order) throw new CashfreeApiError(404);
    return order;
  };
  return {
    ...actual,
    cashfreeCallbackUrls: () => ({
      return_url: "https://portal.test/return",
      notify_url: "https://portal.test/webhook",
    }),
    createOrder: async (p: {
      order_id: string;
      order_amount: number;
      order_currency: string;
      order_expiry_time: string;
    }) => {
      const previous = state.orders.get(p.order_id);
      if (previous) return previous;
      state.creates++;
      const order = {
        ...p,
        cf_order_id: p.order_id,
        order_status: "ACTIVE",
        payment_session_id: `session-${p.order_id}`,
      };
      state.orders.set(p.order_id, order);
      if (state.loseCreateResponse) throw new Error("create response lost");
      return order;
    },
    fetchOrder: async (id: string) => get(id),
    fetchOrderPayments: async (id: string) => {
      get(id);
      return state.attempts.get(id) ?? [];
    },
    terminateOrder: async (id: string) => {
      state.terminates++;
      const order = get(id);
      order.order_status = "TERMINATED";
      return order;
    },
  };
});

import { POST as createPaymentOrder } from "@/app/api/payments/order/route";
import { POST as verifyPayment } from "@/app/api/payments/verify/route";
import { POST as cancelPayment } from "@/app/api/payments/cancel/route";
import { POST as paymentWebhook } from "@/app/api/cashfree/webhook/route";
import {
  verifyCashfreePayment,
  reconcileStudentCashfreePayments,
} from "@/lib/payment-verification";
import { nextStudentPayment } from "@/lib/installments";

let client: PGlite;
let db: ReturnType<typeof drizzle<typeof schema>>;
let serial = 0;
beforeAll(async () => {
  process.env.BETTER_AUTH_URL = "https://portal.test";
  process.env.CASHFREE_SECRET_KEY = "test-only-secret";
  client = new PGlite();
  db = drizzle(client, { schema });
  state.db = db;
  await migrate(db, { migrationsFolder: "./drizzle" });
});
afterAll(async () => {
  await client.close();
});
beforeEach(() => {
  state.orders.clear();
  state.attempts.clear();
  state.creates = 0;
  state.terminates = 0;
  state.loseCreateResponse = false;
  state.offline = false;
});

async function student() {
  const id = `cashfree-student-${++serial}`;
  await db.insert(schema.users).values({
    id,
    name: id,
    email: `${id}@example.test`,
    role: "student",
    approvalStatus: "accepted",
  });
  await db.insert(schema.studentProfiles).values({
    userId: id,
    fullName: "Test Student",
    phone: "9876543210",
    course: "Test",
    trade: "Test",
    studyYear: "1",
  });
  const feeId = `fee-${id}`;
  await db.insert(schema.feeDues).values({
    id: feeId,
    userId: id,
    label: "Rent",
    amount: 100000,
    dueDate: "2026-10-31",
    rentMonth: "2026-10",
  });
  state.user = { id, email: `${id}@example.test`, role: "student" };
  return { id, feeId };
}
function request(path: string, body: object) {
  return new Request(`https://portal.test/api/payments/${path}`, {
    method: "POST",
    headers: {
      origin: "https://portal.test",
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}
async function order(feeDueId: string, amount = "500.00") {
  const response = await createPaymentOrder(request("order", { feeDueId, amount }));
  return {
    response,
    body: (await response.json()) as {
      orderId: string;
      payment_session_id?: string;
      alreadyPaid?: boolean;
    },
  };
}
async function record(orderId: string) {
  return (
    await db
      .select()
      .from(schema.payments)
      .where(eq(schema.payments.cashfreeOrderId, orderId))
  )[0];
}
function attempt(orderId: string, status: string, amount = 50000) {
  state.attempts.set(orderId, [
    {
      id: `pay-${orderId}`,
      order_id: orderId,
      amount,
      currency: "INR",
      status,
      time: new Date().toISOString(),
    },
  ]);
}

it("splits odd paise without a third payment and blocks an unsplittable rent", () => {
  expect(nextStudentPayment({ outstanding: 100001, verifiedPaymentCount: 0, rentMonth: "2026-10" }))
    .toEqual({ amount: 50001, installment: 1, installments: 2 });
  expect(nextStudentPayment({ outstanding: 50000, verifiedPaymentCount: 1, rentMonth: "2026-10" }))
    .toEqual({ amount: 50000, installment: 2, installments: 2 });
  expect(nextStudentPayment({ outstanding: 150, verifiedPaymentCount: 0, rentMonth: "2026-10" }))
    .toBeNull();
});

it("rejects a browser amount outside the fixed first rent installment", async () => {
  const { feeId } = await student();
  expect((await order(feeId, "499.00")).response.status).toBe(409);
  expect((await order(feeId, "501.00")).response.status).toBe(409);
  expect((await order(feeId, "1000.00")).response.status).toBe(409);
  expect(state.creates).toBe(0);
});

it("credits exactly two ₹500 installments once each against ₹1000 rent", async () => {
  const { feeId } = await student();
  const first = (await order(feeId)).body.orderId;
  attempt(first, "SUCCESS");
  state.orders.get(first)!.order_status = "PAID";
  await verifyCashfreePayment(first);
  await verifyCashfreePayment(first);
  expect((await order(feeId, "400.00")).response.status).toBe(409);
  const second = (await order(feeId)).body.orderId;
  expect(second).not.toBe(first);
  attempt(second, "SUCCESS");
  state.orders.get(second)!.order_status = "PAID";
  await verifyCashfreePayment(second);
  const paid = await db.select().from(schema.payments).where(eq(schema.payments.feeDueId, feeId));
  expect(paid.filter((p) => p.status === "verified").map((p) => p.amount).sort()).toEqual([50000, 50000]);
  expect((await order(feeId, "1.00")).response.status).not.toBe(200);
});

it("uses the remaining balance for the second payment after an older partial collection", async () => {
  const { id, feeId } = await student();
  await db.insert(schema.payments).values({
    id: `legacy-part-${id}`, userId: id, feeDueId: feeId,
    amount: 30000, method: "admin_manual", status: "verified",
  });
  expect((await order(feeId, "500.00")).response.status).toBe(409);
  expect((await order(feeId, "700.00")).response.status).toBe(200);
});

it("does not create a third rent order after two verified collections", async () => {
  const { id, feeId } = await student();
  await db.insert(schema.payments).values([1, 2].map((part) => ({
    id: `legacy-part-${id}-${part}`, userId: id, feeDueId: feeId,
    amount: 20000, method: "admin_manual" as const, status: "verified" as const,
  })));
  expect((await order(feeId, "600.00")).response.status).toBe(409);
  expect(state.creates).toBe(0);
});

it("does not reopen an older full-rent checkout after the installment rule changes", async () => {
  const { id, feeId } = await student();
  const orderId = `legacy-full-${id}`;
  await db.insert(schema.payments).values({
    id: orderId, userId: id, feeDueId: feeId, amount: 100000,
    method: "cashfree", status: "pending", attemptStatus: "checkout_started",
    cashfreeOrderId: orderId,
  });
  state.orders.set(orderId, {
    order_id: orderId, cf_order_id: orderId, order_status: "ACTIVE",
    order_amount: 1000, order_currency: "INR",
    payment_session_id: `session-${orderId}`,
    order_expiry_time: new Date(Date.now() + 30 * 60_000).toISOString(),
  });
  expect((await order(feeId)).response.status).toBe(409);
  expect(state.creates).toBe(0);
});

it("records an admin custom payment on the admin account without rent credit", async () => {
  const id = `cashfree-admin-${++serial}`;
  await db.insert(schema.users).values({ id, name: "Admin", email: `${id}@example.test`, role: "admin" });
  state.user = { id, email: `${id}@example.test`, name: "Admin", role: "admin" };
  const response = await createPaymentOrder(request("order", { amount: "1.00", phone: "9876543210" }));
  expect(response.status).toBe(200);
  const body = await response.json() as { orderId: string };
  const payment = await record(body.orderId);
  expect(payment.feeDueId).toBeNull();
  expect(payment.amount).toBe(100);
  attempt(body.orderId, "SUCCESS", 100);
  state.orders.get(body.orderId)!.order_status = "PAID";
  await verifyCashfreePayment(body.orderId);
  await verifyCashfreePayment(body.orderId);
  expect((await record(body.orderId)).status).toBe("verified");
});

it("reuses one order for double clicks and a lost response", async () => {
  const { feeId } = await student();
  const first = await order(feeId);
  const second = await order(feeId);
  expect(first.response.status).toBe(200);
  expect(second.body.orderId).toBe(first.body.orderId);
  expect(state.creates).toBe(1);
});

it.each(["FAILED", "USER_DROPPED", "CANCELLED", "VOID"])(
  "releases a %s attempt when the student returns",
  async (status) => {
    const { id, feeId } = await student();
    const first = (await order(feeId)).body.orderId;
    attempt(first, status);
    await reconcileStudentCashfreePayments(id);
    expect((await record(first)).attemptStatus).toBe(
      ["FAILED", "VOID"].includes(status) ? "failed" : "cancelled",
    );
    await verifyCashfreePayment(first);
    expect((await record(first)).status).toBe("failed");
    expect((await order(feeId)).body.orderId).toBe(first);
    expect(state.terminates).toBe(0);
  },
);

it("releases abandoned, Back, and refreshed checkouts with no attempt", async () => {
  const { id, feeId } = await student();
  const first = (await order(feeId)).body.orderId;
  await reconcileStudentCashfreePayments(id);
  expect(state.orders.get(first)?.order_status).toBe("ACTIVE");
  expect((await record(first)).attemptStatus).toBe("cancelled");
  expect((await order(feeId)).body.orderId).toBe(first);
  expect(state.terminates).toBe(0);
});

it("never treats an expired order with a real pending bank payment as safe to recharge", async () => {
  const { id, feeId } = await student();
  const first = (await order(feeId)).body.orderId;
  attempt(first, "PENDING");
  await reconcileStudentCashfreePayments(id);
  expect((await record(first)).attemptStatus).toBe("pending");
  await db
    .update(schema.payments)
    .set({ createdAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000) })
    .where(eq(schema.payments.cashfreeOrderId, first));
  state.orders.get(first)!.order_status = "EXPIRED";
  await reconcileStudentCashfreePayments(id);
  expect((await record(first)).attemptStatus).toBe("pending");
  await verifyCashfreePayment(first);
  expect((await record(first)).attemptStatus).toBe("pending");
  const retry = await order(feeId);
  expect(retry.response.status).toBe(202);
  expect(retry.body).toMatchObject({ orderId: first, state: "processing" });
  expect(state.creates).toBe(1);
});

it("expires an unattempted Cashfree order and releases its fee", async () => {
  const { id, feeId } = await student();
  const first = (await order(feeId)).body.orderId;
  state.orders.get(first)!.order_status = "EXPIRED";
  await reconcileStudentCashfreePayments(id);
  expect((await record(first)).attemptStatus).toBe("abandoned");
  expect((await order(feeId)).body.orderId).not.toBe(first);
});

it("credits only a verified Cashfree success and tolerates a delayed webhook", async () => {
  const { feeId } = await student();
  const first = (await order(feeId)).body.orderId;
  attempt(first, "SUCCESS");
  await expect(verifyCashfreePayment(first)).rejects.toThrow("processing");
  expect((await record(first)).status).toBe("pending");
  state.orders.get(first)!.order_status = "PAID";
  await verifyCashfreePayment(first);
  await verifyCashfreePayment(first);
  expect((await record(first)).status).toBe("verified");
  expect((await order(feeId)).body.orderId).not.toBe(first);
});

it("keeps a reservation during a provider outage and safely retries", async () => {
  const { id, feeId } = await student();
  const first = (await order(feeId)).body.orderId;
  state.offline = true;
  await reconcileStudentCashfreePayments(id);
  expect((await record(first)).status).toBe("pending");
  state.offline = false;
  const cancel = await cancelPayment(request("cancel", { orderId: first }));
  expect((await cancel.json()).status).toBe("retry");
  expect((await order(feeId)).body.orderId).toBe(first);
});

it("retries a delayed webhook and shares the settlement record with page verification", async () => {
  const { feeId } = await student();
  const first = (await order(feeId)).body.orderId;
  attempt(first, "SUCCESS");
  const body = JSON.stringify({
    type: "PAYMENT_SUCCESS_WEBHOOK",
    data: { order: { order_id: first } },
  });
  const signature = createHmac("sha256", "test-only-secret")
    .update("123" + body)
    .digest("base64");
  const event = new Request("https://portal.test/api/cashfree/webhook", {
    method: "POST",
    body,
    headers: { "x-webhook-timestamp": "123", "x-webhook-signature": signature },
  });
  expect((await paymentWebhook(event.clone())).status).toBe(503);
  state.orders.get(first)!.order_status = "PAID";
  expect((await paymentWebhook(event.clone())).status).toBe(200);
  await verifyCashfreePayment(first);
  expect((await record(first)).status).toBe("verified");
});

it("reproduces the live NOT_ATTEMPTED / TERMINATION_REQUESTED state without calling it bank processing", async () => {
  const { id, feeId } = await student();
  const first = (await order(feeId)).body.orderId;
  attempt(first, "NOT_ATTEMPTED");
  state.orders.get(first)!.order_status = "TERMINATION_REQUESTED";
  await reconcileStudentCashfreePayments(id);
  expect((await record(first)).status).toBe("failed");
  const closing = await order(feeId);
  expect(closing.response.status).toBe(202);
  expect(closing.body).toMatchObject({ orderId: first, state: "closing" });
  const check = await verifyPayment(request("verify", { order_id: first }));
  expect(await check.json()).toMatchObject({
    state: "closing",
    retrySafe: false,
    paid: false,
  });
  expect(state.creates).toBe(1);
  state.orders.get(first)!.order_status = "TERMINATED";
  const retry = await order(feeId);
  expect(retry.response.status).toBe(200);
  expect(retry.body.orderId).not.toBe(first);
});

it("reopens an old ACTIVE order with NOT_ATTEMPTED instead of terminating or blocking it", async () => {
  const { feeId } = await student();
  const first = (await order(feeId)).body.orderId;
  attempt(first, "NOT_ATTEMPTED");
  await db
    .update(schema.payments)
    .set({ createdAt: new Date(Date.now() - 10 * 60 * 1000) })
    .where(eq(schema.payments.cashfreeOrderId, first));
  const retry = await order(feeId);
  expect(retry.response.status).toBe(200);
  expect(retry.body.orderId).toBe(first);
  expect(retry.body.payment_session_id).toBeTruthy();
  expect(state.terminates).toBe(0);
  expect(state.creates).toBe(1);
});

it("blocks a recent actual PENDING payment even inside the old two-minute reuse window", async () => {
  const { feeId } = await student();
  const first = (await order(feeId)).body.orderId;
  attempt(first, "PENDING");
  const retry = await order(feeId);
  expect(retry.response.status).toBe(202);
  expect(retry.body).toMatchObject({ state: "processing" });
  expect(retry.body.payment_session_id).toBeUndefined();
  expect(state.creates).toBe(1);
});

it("recovers a lost create response using the durable reservation", async () => {
  const { feeId } = await student();
  state.loseCreateResponse = true;
  expect((await order(feeId)).response.ok).toBe(false);
  const first = [...state.orders.keys()][0];
  state.loseCreateResponse = false;
  const retry = await order(feeId);
  expect(retry.response.status).toBe(200);
  expect(retry.body.orderId).toBe(first);
  expect(state.creates).toBe(1);
});

it("shares a reservation between simultaneous double clicks", async () => {
  const { feeId } = await student();
  const [first, second] = await Promise.all([order(feeId), order(feeId)]);
  expect(first.response.status).toBe(200);
  expect(second.response.status).toBe(200);
  expect(first.body.orderId).toBe(second.body.orderId);
  expect(state.creates).toBe(1);
});

it("recovers legacy null state and does not depend on review note text", async () => {
  const { id, feeId } = await student();
  const first = (await order(feeId)).body.orderId;
  await db
    .update(schema.payments)
    .set({ attemptStatus: null, reviewNote: "old arbitrary wording" })
    .where(eq(schema.payments.cashfreeOrderId, first));
  state.orders.get(first)!.order_status = "EXPIRED";
  await reconcileStudentCashfreePayments(id);
  expect((await record(first)).attemptStatus).toBe("abandoned");
  expect((await order(feeId)).body.orderId).not.toBe(first);
});
