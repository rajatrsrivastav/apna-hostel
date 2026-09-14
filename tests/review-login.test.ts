import { createHmac, randomBytes } from "node:crypto";
import {
  beforeAll,
  beforeEach,
  afterAll,
  afterEach,
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
  headers: new Headers(),
}));
vi.mock("@/db", () => ({ getDb: () => shared.db }));
vi.mock("next/headers", () => ({ headers: async () => shared.headers }));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error("REDIRECT:" + path);
  },
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
}));
import { currentUser, requireAdmin, studentPage } from "@/lib/access";
import { REVIEW_USER_ID } from "@/lib/env";
import { studentData } from "@/lib/data";
import { POST as authRoute } from "@/app/api/auth/[...all]/route";
import { proxy } from "@/proxy";
import ReviewLogin from "@/app/review-login/page";
import Login from "@/app/login/page";
import AdminLayout from "@/app/(portal)/admin/layout";
import Pay from "@/app/(portal)/student/pay/page";
import Receipt from "@/app/(portal)/receipts/[id]/page";
import { POST as order } from "@/app/api/payments/order/route";
import { POST as verify } from "@/app/api/payments/verify/route";
import { POST as reconcile } from "@/app/api/payments/reconcile/route";
import { GET as screenshot } from "@/app/api/payments/[id]/screenshot/route";
import { POST as admission } from "@/app/api/admin/admissions/route";
import {
  POST as collect,
  PATCH as correct,
} from "@/app/api/admin/collections/route";
import { POST as addFee, PATCH as editFee } from "@/app/api/admin/fees/route";
import { POST as review } from "@/app/api/admin/review/route";
let client: PGlite;
let db: ReturnType<typeof drizzle<typeof schema>>;
const origin = "http://localhost:3000";
const request = (body: object, path = "/api/auth/review-login", headers = {}) =>
  new Request(origin + path, {
    method: "POST",
    headers: { origin, "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
const credentials = () => ({
  email: process.env.RAZORPAY_REVIEW_EMAIL!,
  password: process.env.RAZORPAY_REVIEW_PASSWORD!,
});
async function signIn() {
  const response = await authRoute(request(credentials()));
  expect(response.status).toBe(200);
  const cookie = response.headers
    .getSetCookie()
    .find((value) => value.startsWith("better-auth.session_token="));
  expect(cookie).toContain("HttpOnly");
  shared.headers = new Headers({ cookie: cookie!.split(";")[0] });
  expect(await response.json()).toEqual({ ok: true });
  return response;
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
afterEach(() => vi.unstubAllGlobals());
beforeEach(async () => {
  shared.headers = new Headers();
  Object.assign(process.env, {
    DATABASE_URL: "postgresql://test:test@localhost/test",
    BETTER_AUTH_URL: origin,
    BETTER_AUTH_SECRET: "test-only-secret-for-auth-adapter-123456789",
    GOOGLE_CLIENT_ID: "test-client",
    GOOGLE_CLIENT_SECRET: "test-secret",
    ENABLE_RAZORPAY_REVIEW_LOGIN: "true",
    RAZORPAY_REVIEW_EMAIL: "review@example.test",
    RAZORPAY_REVIEW_PASSWORD: randomBytes(24).toString("base64url"),
    ADMIN_EMAIL: "admin@example.test",
    RAZORPAY_KEY_ID: "rzp_test_mock",
    RAZORPAY_KEY_SECRET: randomBytes(24).toString("hex"),
  });
  await client.exec("TRUNCATE users, rate_limits CASCADE");
});
it("returns 404 when disabled, including the credential endpoint", async () => {
  for (const flag of ["false", "", "TRUE"]) {
    process.env.ENABLE_RAZORPAY_REVIEW_LOGIN = flag;
    expect(() => ReviewLogin()).toThrow("NOT_FOUND");
    expect(proxy().status).toBe(404);
    expect((await authRoute(request({}))).status).toBe(404);
  }
  expect(await db.select().from(schema.users)).toHaveLength(0);
});
it("creates only an accepted test student, profile, and one ₹1000 rent; re-login is idempotent", async () => {
  await signIn();
  const { user, profile } = await studentPage();
  expect(user).toMatchObject({
    id: REVIEW_USER_ID,
    role: "student",
    approvalStatus: "accepted",
    emailVerified: false,
  });
  expect(profile.fullName).toContain("TEST STUDENT");
  expect((await studentData(user.id)).totalDue).toBe(100000);
  await expect(Login({ searchParams: Promise.resolve({}) })).rejects.toThrow(
    "REDIRECT:/dashboard",
  );
  await expect(Pay()).resolves.toBeTruthy();
  await signIn();
  expect(await db.select().from(schema.users)).toHaveLength(1);
  expect(await db.select().from(schema.feeDues)).toHaveLength(1);
  expect(await db.select().from(schema.accounts)).toHaveLength(0);
});
it("rejects wrong credentials and rate limits even changing IPs and submitted emails", async () => {
  for (let i = 0; i < 5; i++) {
    expect(
      (
        await authRoute(
          request(
            { email: i + "@example.test", password: "incorrect" },
            undefined,
            { "x-forwarded-for": "192.0.2." + i },
          ),
        )
      ).status,
    ).toBe(401);
  }
  expect(
    (
      await authRoute(
        request(credentials(), undefined, { "x-forwarded-for": "192.0.2.100" }),
      )
    ).status,
  ).toBe(429);
  expect(await db.select().from(schema.users)).toHaveLength(0);
});
it("rejects cross-origin login and missing or weak configuration", async () => {
  expect(
    (
      await authRoute(
        request(credentials(), undefined, {
          origin: "https://attacker.example",
        }),
      )
    ).status,
  ).toBe(403);
  process.env.RAZORPAY_REVIEW_PASSWORD = "";
  expect((await authRoute(request(credentials()))).status).toBe(503);
  process.env.RAZORPAY_REVIEW_PASSWORD = "short";
  expect((await authRoute(request(credentials()))).status).toBe(503);
});
it("cannot reuse an existing student, admin, or linked Google account", async () => {
  process.env.RAZORPAY_REVIEW_EMAIL = process.env.ADMIN_EMAIL;
  expect((await authRoute(request(credentials()))).status).toBe(503);
  process.env.RAZORPAY_REVIEW_EMAIL = "real@example.test";
  await db
    .insert(schema.users)
    .values({ id: "real", name: "Real student", email: "real@example.test" });
  expect((await authRoute(request(credentials()))).status).toBe(503);
  expect((await db.select().from(schema.users))[0].approvalStatus).toBe(
    "pending",
  );
  process.env.RAZORPAY_REVIEW_EMAIL = "review@example.test";
  await signIn();
  await db.insert(schema.accounts).values({
    id: "google",
    userId: REVIEW_USER_ID,
    providerId: "google",
    accountId: "google-id",
  });
  expect((await authRoute(request(credentials()))).status).toBe(503);
});
it("never grants admin access, even if role, verified email, and ADMIN_EMAIL change", async () => {
  await signIn();
  process.env.ADMIN_EMAIL = process.env.RAZORPAY_REVIEW_EMAIL;
  await db
    .update(schema.users)
    .set({ role: "admin", emailVerified: true })
    .where(eq(schema.users.id, REVIEW_USER_ID));
  await expect(requireAdmin()).rejects.toMatchObject({ status: 403 });
  await expect(AdminLayout({ children: null })).rejects.toThrow(
    "REDIRECT:/dashboard",
  );
  for (const handler of [admission, collect, correct, addFee, editFee, review])
    expect((await handler(request({}))).status).toBe(403);
});
it("cannot access another student's fees, receipts, payment status, or screenshots", async () => {
  await signIn();
  await db
    .insert(schema.users)
    .values({ id: "real", name: "Real student", email: "real@example.test" });
  await db.insert(schema.feeDues).values({
    id: "real-fee",
    userId: "real",
    label: "Private",
    amount: 100000,
    dueDate: "2026-09-30",
  });
  await db.insert(schema.payments).values({
    id: "real-payment",
    userId: "real",
    feeDueId: "real-fee",
    method: "razorpay",
    amount: 100000,
    razorpayOrderId: "order_real",
    screenshotPublicId: "private",
  });
  expect((await order(request({ feeDueId: "real-fee" }))).status).toBe(404);
  expect((await reconcile(request({ paymentId: "real-payment" }))).status).toBe(
    404,
  );
  expect(
    (
      await verify(
        request({
          razorpay_order_id: "order_real",
          razorpay_payment_id: "pay_real",
          razorpay_signature: "a".repeat(64),
        }),
      )
    ).status,
  ).toBe(404);
  expect(
    (
      await screenshot(new Request(origin), {
        params: Promise.resolve({ id: "real-payment" }),
      })
    ).status,
  ).toBe(404);
  await expect(
    Receipt({ params: Promise.resolve({ id: "real-payment" }) }),
  ).rejects.toThrow("NOT_FOUND");
  expect((await studentData(REVIEW_USER_ID)).dues).toHaveLength(1);
});
it("uses normal Razorpay order and signature verification, preserving the paid history on re-login", async () => {
  await signIn();
  const fetchMock = vi.fn(async (url: string) =>
    Response.json(
      url.endsWith("/orders")
        ? { id: "order_review", amount: 100000, currency: "INR" }
        : {
            id: "pay_review",
            order_id: "order_review",
            amount: 100000,
            currency: "INR",
            status: "captured",
            captured: true,
          },
    ),
  );
  vi.stubGlobal("fetch", fetchMock);
  const [fee] = await db.select().from(schema.feeDues);
  const checkout = await order(request({ feeDueId: fee.id }));
  expect(checkout.status).toBe(200);
  expect(await checkout.json()).toMatchObject({
    orderId: "order_review",
    amount: 100000,
    key: "rzp_test_mock",
  });
  const signature = createHmac("sha256", process.env.RAZORPAY_KEY_SECRET!)
    .update("order_review|pay_review")
    .digest("hex");
  const paid = await verify(
    request({
      razorpay_order_id: "order_review",
      razorpay_payment_id: "pay_review",
      razorpay_signature: signature,
    }),
  );
  expect(paid.status).toBe(200);
  expect((await paid.json()).status).toBe("verified");
  await signIn();
  const data = await studentData(REVIEW_USER_ID);
  expect(data.totalDue).toBe(0);
  expect(data.totalPaid).toBe(100000);
  expect(data.history).toHaveLength(1);
});
it("logs out through Better Auth and invalidates existing reviewer sessions when disabled", async () => {
  await signIn();
  const response = await authRoute(
    request({}, "/api/auth/sign-out", {
      cookie: shared.headers.get("cookie")!,
    }),
  );
  expect(response.status).toBe(200);
  expect(await currentUser()).toBeNull();
  expect(await db.select().from(schema.sessions)).toHaveLength(0);
  await signIn();
  process.env.ENABLE_RAZORPAY_REVIEW_LOGIN = "false";
  expect(await currentUser()).toBeNull();
  expect(await db.select().from(schema.sessions)).toHaveLength(0);
  process.env.ENABLE_RAZORPAY_REVIEW_LOGIN = "true";
  expect(await currentUser()).toBeNull();
});
