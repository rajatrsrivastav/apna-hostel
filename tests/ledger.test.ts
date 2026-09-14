import {
  beforeAll,
  beforeEach,
  afterAll,
  describe,
  it,
  expect,
  vi,
} from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { eq } from "drizzle-orm";
import * as schema from "@/db/schema";
const shared = vi.hoisted(() => ({
  db: undefined as unknown,
  user: {
    id: "student-a",
    role: "student",
    name: "Student A",
    email: "a@example.test",
  },
}));
vi.mock("@/db", () => ({ getDb: () => shared.db }));
vi.mock("@/lib/access", async () => {
  const { AppError } = await import("@/lib/errors");
  return {
    requireUser: async () => {
      if (!shared.user.id) throw new AppError("Sign in", 401);
      return shared.user;
    },
    requireAdmin: async () => {
      if (shared.user.role !== "admin") throw new AppError("Forbidden", 403);
      return shared.user;
    },
  };
});
vi.mock("@/lib/razorpay", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/razorpay")>()),
  fetchPayment: vi.fn(),
  fetchOrderPayments: vi.fn(),
  createOrder: vi.fn(),
}));
import { settleProviderPayment } from "@/lib/ledger";
import { POST as review } from "@/app/api/admin/review/route";
import { POST as order } from "@/app/api/payments/order/route";
import { POST as verify } from "@/app/api/payments/verify/route";
import { POST as webhook } from "@/app/api/razorpay/webhook/route";
import { PATCH as editFee } from "@/app/api/admin/fees/route";
import { GET as screenshot } from "@/app/api/payments/[id]/screenshot/route";
import { fetchPayment, createOrder } from "@/lib/razorpay";
import { createHmac } from "node:crypto";
let client: PGlite;
let db: ReturnType<typeof drizzle<typeof schema>>;
const request = (path: string, body: object, method = "POST") =>
  new Request(`https://hostel.example${path}`, {
    method,
    headers: {
      origin: "https://hostel.example",
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
const captured = {
  id: "pay_captured",
  order_id: "order_123",
  amount: 50000,
  currency: "INR",
  status: "captured",
  captured: true,
};
async function payment() {
  return (
    await db
      .select()
      .from(schema.payments)
      .where(eq(schema.payments.id, "payment-1"))
  )[0];
}
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
  process.env.BETTER_AUTH_URL = "https://hostel.example";
  process.env.RAZORPAY_KEY_SECRET = "test-only-key-secret";
  process.env.RAZORPAY_WEBHOOK_SECRET = "test-only-webhook-secret";
  process.env.RAZORPAY_KEY_ID = "rzp_test_test";
  shared.user = {
    id: "student-a",
    role: "student",
    name: "Student A",
    email: "a@example.test",
  };
  await client.exec(
    "TRUNCATE payments, fee_dues, student_profiles, users, rate_limits CASCADE",
  );
  await db.insert(schema.users).values([
    { id: "student-a", name: "Student A", email: "a@example.test" },
    { id: "student-b", name: "Student B", email: "b@example.test" },
    { id: "admin", name: "Admin", email: "admin@example.test", role: "admin" },
  ]);
  await db
    .insert(schema.studentProfiles)
    .values({
      userId: "student-a",
      fullName: "Student A",
      phone: "9876543210",
      course: "ITI",
      trade: "Electrician",
      studyYear: "Year 1",
    });
  await db
    .insert(schema.feeDues)
    .values({
      id: "fee-1",
      userId: "student-a",
      label: "Hostel fee",
      amount: 50000,
      dueDate: "2026-10-01",
    });
  await db
    .insert(schema.payments)
    .values({
      id: "payment-1",
      userId: "student-a",
      feeDueId: "fee-1",
      amount: 50000,
      method: "razorpay",
      razorpayOrderId: "order_123",
    });
});
describe("Migrated PostgreSQL ledger and API integration", () => {
  it("credits a captured payment once even for repeated and out-of-order notifications", async () => {
    await settleProviderPayment(captured);
    await settleProviderPayment(captured);
    await settleProviderPayment({
      ...captured,
      status: "failed",
      captured: false,
    });
    expect((await payment()).status).toBe("verified");
    expect(await db.select().from(schema.payments)).toHaveLength(1);
  });
  it("rejects wrong amounts and currency, and never credits authorization alone", async () => {
    await expect(
      settleProviderPayment({ ...captured, amount: 1 }),
    ).rejects.toThrow("amount");
    await expect(
      settleProviderPayment({ ...captured, currency: "USD" }),
    ).rejects.toThrow("amount");
    await settleProviderPayment({
      ...captured,
      status: "authorized",
      captured: false,
    });
    expect((await payment()).status).toBe("pending");
  });
  it("allows failed orders to be reconciled if subsequently captured", async () => {
    await settleProviderPayment({
      ...captured,
      status: "failed",
      captured: false,
    });
    expect((await payment()).status).toBe("failed");
    await settleProviderPayment(captured);
    expect((await payment()).status).toBe("verified");
  });
  it("requires admin permission for manual review", async () => {
    expect(
      (
        await review(
          request("/api/admin/review", {
            id: "payment-1",
            decision: "verified",
          }),
        )
      ).status,
    ).toBe(403);
  });
  it("approves manual payments idempotently and records the reviewer", async () => {
    shared.user.id = "admin";
    shared.user.role = "admin";
    await db
      .update(schema.payments)
      .set({
        method: "manual_upi",
        razorpayOrderId: null,
        screenshotPublicId: "hostel-payments/1",
      });
    const req = () =>
      request("/api/admin/review", { id: "payment-1", decision: "verified" });
    expect((await review(req())).status).toBe(200);
    expect((await review(req())).status).toBe(200);
    expect((await payment()).reviewedBy).toBe("admin");
    expect((await payment()).status).toBe("verified");
  });
  it("cannot approve incomplete uploads or overwrite a rejection", async () => {
    shared.user.id = "admin";
    shared.user.role = "admin";
    await db
      .update(schema.payments)
      .set({ method: "manual_upi", razorpayOrderId: null });
    expect(
      (
        await review(
          request("/api/admin/review", {
            id: "payment-1",
            decision: "verified",
          }),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await review(
          request("/api/admin/review", {
            id: "payment-1",
            decision: "rejected",
            note: "Wrong screenshot",
          }),
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await review(
          request("/api/admin/review", {
            id: "payment-1",
            decision: "verified",
          }),
        )
      ).status,
    ).toBe(409);
  });
  it("prevents approving manual overpayments after another payment settles", async () => {
    shared.user.id = "admin";
    shared.user.role = "admin";
    await db
      .update(schema.payments)
      .set({
        method: "manual_upi",
        razorpayOrderId: null,
        screenshotPublicId: "hostel-payments/1",
      });
    await db
      .insert(schema.payments)
      .values({
        id: "other-payment",
        userId: "student-a",
        feeDueId: "fee-1",
        amount: 40000,
        method: "razorpay",
        status: "verified",
        razorpayOrderId: "order_other",
      });
    expect(
      (
        await review(
          request("/api/admin/review", {
            id: "payment-1",
            decision: "verified",
          }),
        )
      ).status,
    ).toBe(400);
    expect((await payment()).status).toBe("pending");
  });
  it("does not expose another student’s screenshot or checkout", async () => {
    shared.user.id = "student-b";
    expect(
      (
        await screenshot(new Request("https://hostel.example"), {
          params: Promise.resolve({ id: "payment-1" }),
        })
      ).status,
    ).toBe(404);
    await db
      .insert(schema.studentProfiles)
      .values({
        userId: "student-b",
        fullName: "Student B",
        phone: "9876543211",
        course: "ITI",
        trade: "Fitter",
        studyYear: "Year 1",
      });
    expect(
      (await order(request("/api/payments/order", { feeDueId: "fee-1" })))
        .status,
    ).toBe(404);
    expect(createOrder).not.toHaveBeenCalled();
  });
  it("reuses an existing order and never trusts frontend amounts", async () => {
    const response = await order(
      request("/api/payments/order", { feeDueId: "fee-1", amount: 1 }),
    );
    expect(response.status).toBe(200);
    expect((await response.json()).amount).toBe(50000);
    expect(createOrder).not.toHaveBeenCalled();
  });
  it("rejects forged checkout success before calling Razorpay", async () => {
    const response = await verify(
      request("/api/payments/verify", {
        razorpay_order_id: "order_123",
        razorpay_payment_id: "pay_captured",
        razorpay_signature: "0".repeat(64),
      }),
    );
    expect(response.status).toBe(400);
    expect(fetchPayment).not.toHaveBeenCalled();
    expect((await payment()).status).toBe("pending");
  });
  it("requires server capture verification even with a valid checkout signature", async () => {
    vi.mocked(fetchPayment).mockResolvedValue({
      ...captured,
      status: "authorized",
      captured: false,
    });
    const signature = createHmac("sha256", process.env.RAZORPAY_KEY_SECRET!)
      .update("order_123|pay_captured")
      .digest("hex");
    const response = await verify(
      request("/api/payments/verify", {
        razorpay_order_id: "order_123",
        razorpay_payment_id: "pay_captured",
        razorpay_signature: signature,
      }),
    );
    expect(response.status).toBe(200);
    expect((await payment()).status).toBe("pending");
  });
  it("validates raw webhook bytes and handles duplicate capture events", async () => {
    vi.mocked(fetchPayment).mockResolvedValue(captured);
    const raw = JSON.stringify({
      event: "payment.captured",
      payload: { payment: { entity: { id: "pay_captured" } } },
    });
    const signature = createHmac("sha256", process.env.RAZORPAY_WEBHOOK_SECRET!)
      .update(raw)
      .digest("hex");
    const req = (body = raw) =>
      new Request("https://hostel.example/api/razorpay/webhook", {
        method: "POST",
        headers: { "x-razorpay-signature": signature },
        body,
      });
    expect((await webhook(req(raw + " "))).status).toBe(400);
    expect((await webhook(req())).status).toBe(200);
    expect((await webhook(req())).status).toBe(200);
    expect((await payment()).status).toBe("verified");
  });
  it("protects pending dues from editing and rejects stale admin revisions", async () => {
    shared.user.id = "admin";
    shared.user.role = "admin";
    const body = {
      id: "fee-1",
      revision: 0,
      action: "update",
      amount: "600",
      dueDate: "2026-11-01",
      note: "New amount",
    };
    expect(
      (await editFee(request("/api/admin/fees", body, "PATCH"))).status,
    ).toBe(409);
    await db.update(schema.payments).set({ status: "failed" });
    expect(
      (await editFee(request("/api/admin/fees", body, "PATCH"))).status,
    ).toBe(200);
    expect(
      (await editFee(request("/api/admin/fees", body, "PATCH"))).status,
    ).toBe(409);
  });
  it("keeps manual paid adjustments reversible without fabricating payments", async () => {
    shared.user.id = "admin";
    shared.user.role = "admin";
    await db.update(schema.payments).set({ status: "failed" });
    expect(
      (
        await editFee(
          request(
            "/api/admin/fees",
            {
              id: "fee-1",
              revision: 0,
              action: "paid",
              note: "Fee concession",
            },
            "PATCH",
          ),
        )
      ).status,
    ).toBe(200);
    let fee = (await db.select().from(schema.feeDues))[0];
    expect(fee.waivedAmount).toBe(50000);
    expect((await payment()).status).toBe("failed");
    expect(fee.audit).toHaveLength(1);
    expect(
      (
        await editFee(
          request(
            "/api/admin/fees",
            {
              id: "fee-1",
              revision: 1,
              action: "unpaid",
              note: "Concession reversed",
            },
            "PATCH",
          ),
        )
      ).status,
    ).toBe(200);
    fee = (await db.select().from(schema.feeDues))[0];
    expect(fee.waivedAmount).toBe(0);
    expect(fee.audit).toHaveLength(2);
  });
  it("enforces unique pending payments at the database boundary", async () => {
    await expect(
      db
        .insert(schema.payments)
        .values({
          id: "duplicate",
          userId: "student-a",
          feeDueId: "fee-1",
          amount: 50000,
          method: "manual_upi",
        }),
    ).rejects.toThrow();
  });
});
