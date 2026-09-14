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
  userId: "admin",
}));
vi.mock("@/db", () => ({ getDb: () => shared.db }));
vi.mock("@/lib/auth", () => ({
  getAuth: () => ({
    api: {
      getSession: async () =>
        shared.userId ? { user: { id: shared.userId } } : null,
    },
  }),
}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`REDIRECT:${path}`);
  },
}));
import {
  currentUser,
  requireUser,
  requireAdmin,
  studentPage,
} from "@/lib/access";
import { generateMonthlyRent } from "@/lib/rent";
import { studentData, pendingStudents } from "@/lib/data";
import { POST as admission } from "@/app/api/admin/admissions/route";
import {
  POST as collect,
  PATCH as correct,
} from "@/app/api/admin/collections/route";
import { POST as profile } from "@/app/api/profile/route";
import { POST as order } from "@/app/api/payments/order/route";
import { POST as manual } from "@/app/api/payments/manual/route";
import { POST as verify } from "@/app/api/payments/verify/route";
import { POST as reconcile } from "@/app/api/payments/reconcile/route";
import { GET as screenshot } from "@/app/api/payments/[id]/screenshot/route";
import { GET as cron } from "@/app/api/cron/rent/route";
import Receipt from "@/app/(portal)/receipts/[id]/page";
import Login from "@/app/login/page";
import Approval from "@/app/approval/page";
import AdminLayout from "@/app/(portal)/admin/layout";
import { PATCH as editFee, POST as addFee } from "@/app/api/admin/fees/route";
import { POST as review } from "@/app/api/admin/review/route";
import PortalLayout from "@/app/(portal)/layout";
import Onboarding from "@/app/onboarding/page";
let client: PGlite;
let db: ReturnType<typeof drizzle<typeof schema>>;
const now = new Date("2026-03-15T08:00:00Z");
const req = (body: object, method = "POST") =>
  new Request("https://hostel.example/api/test", {
    method,
    headers: {
      origin: "https://hostel.example",
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
async function completeProfile() {
  await db.insert(schema.studentProfiles).values({ userId: "student", fullName: "Student", phone: "9876543210", course: "ITI", trade: "Electrician", studyYear: "Year 1" }).onConflictDoNothing();
}
async function acceptAt(date = "2026-01-20T10:00:00Z") {
  await completeProfile();
  await db
    .update(schema.users)
    .set({ approvalStatus: "accepted", acceptedAt: new Date(date) })
    .where(eq(schema.users.id, "student"));
}
async function rent() {
  return db.select().from(schema.feeDues).orderBy(schema.feeDues.rentMonth);
}
beforeAll(async () => {
  client = new PGlite();
  db = drizzle(client, { schema });
  shared.db = db;
  await migrate(db, { migrationsFolder: "./drizzle" });
});
afterAll(async () => {
  vi.useRealTimers();
  await client.close();
});
beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(now);
  shared.userId = "admin";
  process.env.BETTER_AUTH_URL = "https://hostel.example";
  process.env.DATABASE_URL = "postgresql://test:test@localhost/test";
  process.env.BETTER_AUTH_SECRET = "test-secret";
  process.env.ADMIN_EMAIL = "admin@example.test";
  process.env.CRON_SECRET = "test-cron-secret";
  await client.exec(
    "TRUNCATE payments, fee_dues, student_profiles, users, rate_limits CASCADE",
  );
  await db.insert(schema.users).values([
    { id: "student", name: "Student", email: "student@example.test" },
    { id: "other", name: "Other", email: "other@example.test" },
    {
      id: "admin",
      name: "Admin",
      email: "admin@example.test",
      emailVerified: true,
      role: "admin",
    },
  ]);
});
describe("Admission gates on real database roles", () => {
  it("defaults new students to onboarding incomplete and blocks protected student mutations before parsing or provider calls", async () => {
    shared.userId = "student";
    expect(
      (
        await db
          .select()
          .from(schema.users)
          .where(eq(schema.users.id, "student"))
      )[0].approvalStatus,
    ).toBe("onboarding_incomplete");
    await expect(requireUser()).rejects.toMatchObject({ status: 403 });
    await expect(requireAdmin()).rejects.toMatchObject({ status: 403 });
    for (const handler of [order, manual, verify, reconcile])
      expect((await handler(req({}))).status).toBe(403);
    expect(
      (
        await screenshot(new Request("https://hostel.example"), {
          params: Promise.resolve({ id: "anything" }),
        })
      ).status,
    ).toBe(403);
    await expect(
      Receipt({ params: Promise.resolve({ id: "anything" }) }),
    ).rejects.toMatchObject({ status: 403 });
    await expect(studentPage()).rejects.toThrow("REDIRECT:/onboarding");
    await expect(Onboarding()).resolves.toBeTruthy();
    await expect(PortalLayout({ children: null })).rejects.toThrow(
      "REDIRECT:/onboarding",
    );
  });
  it("immediately revokes existing student sessions when rejected", async () => {
    await acceptAt();
    shared.userId = "student";
    expect((await requireUser()).id).toBe("student");
    await db
      .update(schema.users)
      .set({ approvalStatus: "rejected" })
      .where(eq(schema.users.id, "student"));
    await expect(requireUser()).rejects.toMatchObject({ status: 403 });
    await expect(studentPage()).rejects.toThrow("REDIRECT:/approval");
  });
  it("allows admins through without student approval but never allows accepted students as admins", async () => {
    expect((await requireAdmin()).id).toBe("admin");
    await acceptAt();
    shared.userId = "student";
    await expect(requireAdmin()).rejects.toMatchObject({ status: 403 });
    expect(
      (await admission(req({ id: "other", decision: "accepted", revision: 0 })))
        .status,
    ).toBe(403);
  });
  it("accepts atomically, creates only the acceptance month and makes double acceptance harmless", async () => {
    await completeProfile();
    await db.update(schema.users).set({ approvalStatus: "pending" }).where(eq(schema.users.id, "student"));
    const body = { id: "student", decision: "accepted", revision: 0 };
    expect((await admission(req(body))).status).toBe(200);
    expect((await admission(req(body))).status).toBe(200);
    expect((await rent()).map((f) => f.rentMonth)).toEqual(["2026-03"]);
    const [user] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, "student"));
    expect(user.approvalAudit).toHaveLength(1);
    expect(
      (await admission(req({ ...body, decision: "rejected" }))).status,
    ).toBe(409);
  });
});
describe("Monthly ₹1,000 rent", () => {
  it("does not charge pending, rejected, admin or future-accepted users", async () => {
    expect(await generateMonthlyRent(undefined, now)).toBe(0);
    await acceptAt("2026-04-01T00:00:00Z");
    expect(await generateMonthlyRent(undefined, now)).toBe(0);
    await db
      .update(schema.users)
      .set({ approvalStatus: "rejected" })
      .where(eq(schema.users.id, "student"));
    expect(await generateMonthlyRent(undefined, now)).toBe(0);
  });
  it("catches up missed months without duplicating carry-forward", async () => {
    await acceptAt();
    expect(await generateMonthlyRent("student", now)).toBe(3);
    expect(await generateMonthlyRent("student", now)).toBe(0);
    const fees = await rent();
    expect(fees.map((f) => f.rentMonth)).toEqual([
      "2026-01",
      "2026-02",
      "2026-03",
    ]);
    expect(fees.every((f) => f.amount === 100000)).toBe(true);
    const data = await studentData("student");
    expect(data.totalDue).toBe(300000);
    expect(data.previousDue).toBe(200000);
    expect(data.currentMonthRent).toBe(100000);
  });
  it("enforces uniqueness even across simultaneous generation calls", async () => {
    await acceptAt();
    await Promise.all([
      generateMonthlyRent("student", now),
      generateMonthlyRent("student", now),
    ]);
    expect(await rent()).toHaveLength(3);
    const [fee] = await rent();
    await expect(
      db.insert(schema.feeDues).values({
        id: "duplicate",
        userId: "student",
        label: "Duplicate",
        amount: 100000,
        dueDate: "2026-01-31",
        rentMonth: fee.rentMonth,
      }),
    ).rejects.toThrow();
  });
  it("uses Indian month boundaries and the correct last-day due date", async () => {
    await acceptAt("2026-01-31T18:30:00Z");
    await generateMonthlyRent("student", new Date("2026-02-01T00:00:00Z"));
    expect((await rent()).map((f) => [f.rentMonth, f.dueDate])).toEqual([
      ["2026-02", "2026-02-28"],
    ]);
  });
  it("does not backbill rejected intervals when readmitted", async () => {
    await acceptAt("2026-01-01T00:00:00Z");
    vi.setSystemTime(new Date("2026-01-20T00:00:00Z"));
    expect(
      (
        await admission(
          req({ id: "student", decision: "rejected", revision: 0 }),
        )
      ).status,
    ).toBe(200);
    vi.setSystemTime(now);
    expect(
      (
        await admission(
          req({ id: "student", decision: "accepted", revision: 1 }),
        )
      ).status,
    ).toBe(200);
    expect((await rent()).map((f) => f.rentMonth)).toEqual([
      "2026-01",
      "2026-03",
    ]);
  });
  it("requires the cron secret and catches up all accepted accounts", async () => {
    await acceptAt();
    expect(
      (await cron(new Request("https://hostel.example/api/cron/rent"))).status,
    ).toBe(401);
    const response = await cron(
      new Request("https://hostel.example/api/cron/rent", {
        headers: { authorization: "Bearer test-cron-secret" },
      }),
    );
    expect(response.status).toBe(200);
    expect((await response.json()).created).toBe(3);
  });
});
describe("Admin collections", () => {
  it("records partial money received, reduces old debt, and is idempotent", async () => {
    await acceptAt();
    await generateMonthlyRent("student", now);
    const [fee] = await rent();
    const body = {
      id: crypto.randomUUID(),
      feeDueId: fee.id,
      amount: "600",
      paymentDate: "2026-03-15",
      note: "Cash collected at office",
    };
    expect((await collect(req(body))).status).toBe(200);
    expect((await collect(req(body))).status).toBe(200);
    const data = await studentData("student");
    expect(data.totalPaid).toBe(60000);
    expect(data.previousDue).toBe(140000);
    expect(data.totalDue).toBe(240000);
    expect(data.history).toHaveLength(1);
    expect(data.history[0].method).toBe("admin_manual");
  });
  it("corrects and voids admin payments while retaining a complete audit", async () => {
    await acceptAt();
    await generateMonthlyRent("student", now);
    const [fee] = await rent();
    const id = crypto.randomUUID();
    await collect(
      req({
        id,
        feeDueId: fee.id,
        amount: "1000",
        paymentDate: "2026-03-15",
        note: "Paid in cash",
      }),
    );
    const change = {
      id,
      revision: 0,
      amount: "700",
      paymentDate: "2026-03-15",
      note: "Corrected receipt amount",
    };
    expect((await correct(req(change, "PATCH"))).status).toBe(200);
    expect((await studentData("student")).totalPaid).toBe(70000);
    expect((await correct(req(change, "PATCH"))).status).toBe(409);
    expect(
      (
        await correct(
          req(
            {
              ...change,
              revision: 1,
              amount: "0",
              note: "Duplicate cash receipt",
            },
            "PATCH",
          ),
        )
      ).status,
    ).toBe(200);
    const data = await studentData("student");
    expect(data.totalPaid).toBe(0);
    expect(data.totalDue).toBe(300000);
    expect(data.history[0].adminAudit).toHaveLength(2);
  });
  it("blocks students, overpayments, pending-payment conflicts and editing provider collections", async () => {
    await acceptAt();
    await generateMonthlyRent("student", now);
    const [fee] = await rent();
    const body = {
      id: crypto.randomUUID(),
      feeDueId: fee.id,
      amount: "1001",
      paymentDate: "2026-03-15",
      note: "Cash received",
    };
    expect((await collect(req(body))).status).toBe(400);
    shared.userId = "student";
    expect((await collect(req({ ...body, amount: "1000" }))).status).toBe(403);
    shared.userId = "admin";
    await db.insert(schema.payments).values({
      id: "online",
      userId: "student",
      feeDueId: fee.id,
      amount: 100000,
      method: "razorpay",
      status: "pending",
      razorpayOrderId: "order_test",
    });
    expect((await collect(req({ ...body, amount: "1000" }))).status).toBe(409);
    expect(
      (
        await correct(
          req(
            {
              id: "online",
              revision: 0,
              amount: "500",
              paymentDate: "2026-03-15",
              note: "Invalid provider edit",
            },
            "PATCH",
          ),
        )
      ).status,
    ).toBe(403);
  });
});

describe("Unified Google role routing", () => {
  it("redirects signed-in accounts from login according to role and status", async () => {
    await expect(Login({ searchParams: Promise.resolve({}) })).rejects.toThrow(
      "REDIRECT:/admin",
    );
    await expect(Approval()).rejects.toThrow("REDIRECT:/admin");
    shared.userId = "student";
    await expect(Login({ searchParams: Promise.resolve({}) })).rejects.toThrow(
      "REDIRECT:/onboarding",
    );
    await profile(req({ fullName: "Student Name", phone: "9876543210", course: "ITI", trade: "Electrician" }));
    await expect(Login({ searchParams: Promise.resolve({}) })).rejects.toThrow(
      "REDIRECT:/approval",
    );
    await acceptAt();
    await expect(Login({ searchParams: Promise.resolve({}) })).rejects.toThrow(
      "REDIRECT:/dashboard",
    );
    await expect(Approval()).rejects.toThrow("REDIRECT:/dashboard");
    await expect(AdminLayout({ children: null })).rejects.toThrow(
      "REDIRECT:/dashboard",
    );
    await db
      .update(schema.users)
      .set({ approvalStatus: "rejected" })
      .where(eq(schema.users.id, "student"));
    await expect(Login({ searchParams: Promise.resolve({}) })).rejects.toThrow(
      "REDIRECT:/approval",
    );
  });
  it("promotes a verified configured email and revokes stale database admin roles", async () => {
    process.env.ADMIN_EMAIL = "  STUDENT@example.test ";
    await db
      .update(schema.users)
      .set({ emailVerified: true })
      .where(eq(schema.users.id, "student"));
    shared.userId = "student";
    expect((await requireAdmin()).role).toBe("admin");
    shared.userId = "admin";
    expect((await currentUser())?.role).toBe("student");
    await expect(requireAdmin()).rejects.toMatchObject({ status: 403 });
    process.env.ADMIN_EMAIL = "other@example.test";
    shared.userId = "other";
    await expect(requireAdmin()).rejects.toMatchObject({ status: 403 });
  });
  it("blocks all admin mutations for accepted students and anonymous requests", async () => {
    await acceptAt();
    for (const userId of ["student", ""]) {
      shared.userId = userId;
      for (const handler of [
        admission,
        collect,
        correct,
        editFee,
        addFee,
        review,
      ])
        expect((await handler(req({}))).status).toBe(userId ? 403 : 401);
    }
  });
});
describe("Per-student monthly fee", () => {
  it("preserves accrued rent and uses the custom rate only for new months", async () => {
    await acceptAt();
    const body = {
      action: "monthlyRent",
      userId: "student",
      amount: "1250",
      previousAmount: 100000,
    };
    expect((await editFee(req(body, "PATCH"))).status).toBe(200);
    expect((await rent()).map((f) => f.amount)).toEqual([
      100000, 100000, 100000,
    ]);
    expect((await editFee(req(body, "PATCH"))).status).toBe(409);
    await generateMonthlyRent("student", new Date("2026-04-15T00:00:00Z"));
    expect((await rent()).map((f) => f.amount)).toEqual([
      100000, 100000, 100000, 125000,
    ]);
    expect(
      (await editFee(req({ ...body, userId: "admin" }, "PATCH"))).status,
    ).toBe(403);
  });
  it("allows existing monthly fee edits but never below recorded payments", async () => {
    await acceptAt();
    await generateMonthlyRent("student", now);
    const [fee] = await rent();
    const body = {
      id: fee.id,
      revision: 0,
      action: "update",
      amount: "1200",
      dueDate: fee.dueDate,
      note: "Updated agreed monthly fee",
    };
    expect((await editFee(req(body, "PATCH"))).status).toBe(200);
    expect(
      (
        await collect(
          req({
            id: crypto.randomUUID(),
            feeDueId: fee.id,
            amount: "1100",
            paymentDate: "2026-03-15",
            note: "Cash received",
          }),
        )
      ).status,
    ).toBe(200);
    expect(
      (await editFee(req({ ...body, revision: 1, amount: "1000" }, "PATCH")))
        .status,
    ).toBe(400);
    expect((await rent())[0].amount).toBe(120000);
  });
});


describe("First sign-in onboarding", () => {
  const details = { fullName: "Student Name", phone: "9876543210", course: "ITI", trade: "Electrician" };
  it("requires all four details and saves the session user's profile before approval", async () => {
    shared.userId = "student";
    await expect(Approval()).rejects.toThrow("REDIRECT:/onboarding");
    for (const field of Object.keys(details)) {
      expect((await profile(req({ ...details, [field]: "" }))).status).toBe(400);
    }
    expect(await db.select().from(schema.studentProfiles)).toHaveLength(0);
    expect((await profile(req({ ...details, email: "spoof@example.test", userId: "other", approvalStatus: "accepted" }))).status).toBe(200);
    const [saved] = await db.select().from(schema.studentProfiles);
    expect(saved).toMatchObject({ ...details, userId: "student", studyYear: "" });
    const user = await currentUser();
    expect(user).toMatchObject({ email: "student@example.test", approvalStatus: "pending", hasProfile: true });
    await expect(Onboarding()).rejects.toThrow("REDIRECT:/approval");
    await expect(Approval()).resolves.toBeTruthy();
    await expect(studentPage()).rejects.toThrow("REDIRECT:/approval");
  });
  it("never overwrites a returning student's profile or resets their approval", async () => {
    shared.userId = "student";
    await profile(req(details));
    await acceptAt();
    expect((await profile(req({ ...details, fullName: "Changed Name" }))).status).toBe(200);
    expect((await currentUser())?.approvalStatus).toBe("accepted");
    expect((await db.select().from(schema.studentProfiles))[0].fullName).toBe(details.fullName);
    await expect(Onboarding()).rejects.toThrow("REDIRECT:/dashboard");
  });
  it("skips admins and rejects anonymous profile submissions", async () => {
    await expect(Onboarding()).rejects.toThrow("REDIRECT:/admin");
    expect((await profile(req(details))).status).toBe(403);
    shared.userId = "";
    expect((await profile(req(details))).status).toBe(401);
    expect(await db.select().from(schema.studentProfiles)).toHaveLength(0);
  });
});


it("lists only submitted pending profiles and accepts custom course names", async () => {
  expect(await pendingStudents()).toHaveLength(0);
  expect((await admission(req({ id: "student", decision: "accepted", revision: 0 }))).status).toBe(409);
  // A legacy pending user without a profile must also stay hidden.
  await db.update(schema.users).set({ approvalStatus: "pending" }).where(eq(schema.users.id, "other"));
  shared.userId = "student";
  expect((await profile(req({ fullName: "Custom Student", phone: "9876543210", course: "  Bachelor of Arts  ", trade: "History" }))).status).toBe(200);
  const rows = await pendingStudents();
  expect(rows).toHaveLength(1);
  expect(rows[0].user).toMatchObject({ id: "student", email: "student@example.test", approvalStatus: "pending" });
  expect(rows[0].profile).toMatchObject({ fullName: "Custom Student", phone: "9876543210", course: "Bachelor of Arts", trade: "History" });
  shared.userId = "admin";
  expect((await admission(req({ id: "student", decision: "rejected", revision: 0 }))).status).toBe(200);
  expect(await pendingStudents()).toHaveLength(0);
});
