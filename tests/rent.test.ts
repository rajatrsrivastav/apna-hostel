import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { eq } from "drizzle-orm";
import * as schema from "@/db/schema";

const shared = vi.hoisted(() => ({ db: undefined as unknown }));
vi.mock("@/db", () => ({ getDb: () => shared.db }));
import { generateMonthlyRent } from "@/lib/rent";
import { adminStudents } from "@/lib/data";
let client: PGlite;
let db: ReturnType<typeof drizzle<typeof schema>>;
beforeAll(async () => {
  client = new PGlite();
  db = drizzle(client, { schema });
  shared.db = db;
  await migrate(db, { migrationsFolder: "./drizzle" });
});
afterAll(async () => {
  await client.close();
});

it("recovers missing earlier months even when the current month already exists", async () => {
  await db.insert(schema.users).values({
    id: "catchup-student",
    name: "Catch-up student",
    email: "catchup@example.test",
    role: "student",
    approvalStatus: "accepted",
    monthlyRent: 100_000,
    acceptedAt: new Date("2026-09-15T00:00:00Z"),
  });
  await db.insert(schema.feeDues).values({
    id: "existing-december",
    userId: "catchup-student",
    label: "Rent · Dec 2026",
    amount: 100_000,
    dueDate: "2026-12-31",
    rentMonth: "2026-12",
  });
  const now = new Date("2026-12-15T00:00:00Z");
  expect(await generateMonthlyRent("catchup-student", now)).toBe(2);
  expect(await generateMonthlyRent("catchup-student", now)).toBe(0);
  const dues = await db
    .select()
    .from(schema.feeDues)
    .where(eq(schema.feeDues.userId, "catchup-student"));
  expect(dues.map((f) => f.rentMonth).sort()).toEqual([
    "2026-10",
    "2026-11",
    "2026-12",
  ]);
});

it("starts ₹1000 monthly rent on 1 October 2026 and avoids duplicates", async () => {
  await db.insert(schema.users).values({
    id: "rent-student",
    name: "Rent student",
    email: "rent@example.test",
    role: "student",
    approvalStatus: "accepted",
    monthlyRent: 100_000,
    acceptedAt: new Date("2026-08-10T00:00:00Z"),
  });
  expect(
    await generateMonthlyRent("rent-student", new Date("2026-09-24T00:00:00Z")),
  ).toBe(0);
  expect(
    await generateMonthlyRent("rent-student", new Date("2026-09-24T00:00:00Z")),
  ).toBe(0);
  expect(
    await generateMonthlyRent("rent-student", new Date("2026-09-30T18:29:59Z")),
  ).toBe(0);
  expect(
    await generateMonthlyRent("rent-student", new Date("2026-09-30T18:30:00Z")),
  ).toBe(1);
  expect(
    await generateMonthlyRent("rent-student", new Date("2026-10-15T00:00:00Z")),
  ).toBe(0);
  expect(
    await generateMonthlyRent("rent-student", new Date("2026-11-01T00:00:00Z")),
  ).toBe(1);
  const dues = await db
    .select()
    .from(schema.feeDues)
    .where(eq(schema.feeDues.userId, "rent-student"));
  expect(dues.map((f) => [f.rentMonth, f.amount]).sort()).toEqual([
    ["2026-10", 100_000],
    ["2026-11", 100_000],
  ]);
});

it("shows no admin outstanding before October, then charges only October rent", async () => {
  await db.insert(schema.users).values({
    id: "dashboard-student",
    name: "Dashboard student",
    email: "dashboard@example.test",
    role: "student",
    approvalStatus: "accepted",
    monthlyRent: 100_000,
    acceptedAt: new Date("2026-09-01T00:00:00Z"),
  });
  await db.insert(schema.feeDues).values({
    id: "old-september-due",
    userId: "dashboard-student",
    label: "Rent · Sep 2026",
    amount: 100_000,
    dueDate: "2026-09-30",
    rentMonth: "2026-09",
  });
  vi.useFakeTimers();
  try {
    vi.setSystemTime(new Date("2026-09-30T18:29:59Z"));
    expect(
      (await adminStudents()).find(
        (student) => student.id === "dashboard-student",
      )?.outstanding,
    ).toBe(0);
    vi.setSystemTime(new Date("2026-09-30T18:30:00Z"));
    expect(
      (await adminStudents()).find(
        (student) => student.id === "dashboard-student",
      )?.outstanding,
    ).toBe(100_000);
  } finally {
    vi.useRealTimers();
  }
});

it("generates the October rent for the Cashfree review student after launch", async () => {
  await db.insert(schema.users).values({
    id: "cashfree-review-test-student",
    name: "Review student",
    email: "review@example.test",
    role: "student",
    approvalStatus: "accepted",
    monthlyRent: 100_000,
    acceptedAt: new Date("2026-09-15T00:00:00Z"),
  });
  process.env.ENABLE_CASHFREE_REVIEW_LOGIN = "true";
  try {
    expect(
      await generateMonthlyRent(
        "cashfree-review-test-student",
        new Date("2026-09-29T12:00:00Z"),
      ),
    ).toBe(0);
    expect(
      await generateMonthlyRent(
        "cashfree-review-test-student",
        new Date("2026-10-01T00:00:00Z"),
      ),
    ).toBe(1);
    const dues = await db
      .select()
      .from(schema.feeDues)
      .where(eq(schema.feeDues.userId, "cashfree-review-test-student"));
    expect(dues.map((f) => [f.rentMonth, f.amount])).toEqual([
      ["2026-10", 100_000],
    ]);
  } finally {
    delete process.env.ENABLE_CASHFREE_REVIEW_LOGIN;
  }
});

import { recordYearCoverage, changeYearCoverage } from "@/lib/year-coverage";
it("covers the academic year, resumes August, preserves old years, and reverses exactly", async () => {
  await db.insert(schema.users).values([
    {
      id: "year-admin",
      name: "Admin",
      email: "yearadmin@example.test",
      role: "admin",
    },
    {
      id: "year-student",
      name: "Annual",
      email: "annual@example.test",
      role: "student",
      approvalStatus: "accepted",
      acceptedAt: new Date("2026-09-01T00:00:00Z"),
    },
  ]);
  const now = new Date("2026-10-01T00:00:00Z");
  await generateMonthlyRent("year-student", now);
  const [fee] = await db
    .select()
    .from(schema.feeDues)
    .where(eq(schema.feeDues.userId, "year-student"));
  await db
    .update(schema.feeDues)
    .set({ waivedAmount: 20000 })
    .where(eq(schema.feeDues.id, fee.id));
  const id = await recordYearCoverage(
    {
      userId: "year-student",
      startYear: 2026,
      continueNextYear: true,
      note: "Receipt annual 12000",
    },
    "year-admin",
    now,
  );
  expect(
    await generateMonthlyRent("year-student", new Date("2027-07-31T00:00:00Z")),
  ).toBe(0);
  expect(
    await generateMonthlyRent("year-student", new Date("2027-08-01T00:00:00Z")),
  ).toBe(1);
  expect(
    await generateMonthlyRent("year-student", new Date("2027-08-01T00:00:00Z")),
  ).toBe(0);
  await expect(
    recordYearCoverage(
      {
        userId: "year-student",
        startYear: 2026,
        continueNextYear: true,
        note: "Duplicate",
      },
      "year-admin",
      now,
    ),
  ).rejects.toThrow("already recorded");
  await expect(
    changeYearCoverage(
      {
        userId: "year-student",
        id,
        revision: 1,
        action: "revoke",
        note: "Mistake",
      },
      "year-admin",
      now,
    ),
  ).rejects.toThrow("setting changed");
  await changeYearCoverage(
    {
      userId: "year-student",
      id,
      revision: 0,
      action: "revoke",
      note: "Correct mistake",
    },
    "year-admin",
    now,
  );
  const [restored] = await db
    .select()
    .from(schema.feeDues)
    .where(eq(schema.feeDues.id, fee.id));
  expect(restored.waivedAmount).toBe(20000);
  expect(restored.audit.map((a) => a.action)).toEqual([
    "academicYearPaid",
    "academicYearUndo",
  ]);
});
it("stops future rent for departing students, and permits an audited return", async () => {
  await db.insert(schema.users).values({
    id: "leaving-student",
    name: "Leaving",
    email: "leaving@example.test",
    role: "student",
    approvalStatus: "accepted",
    acceptedAt: new Date("2026-09-01T00:00:00Z"),
  });
  const id = await recordYearCoverage(
    {
      userId: "leaving-student",
      startYear: 2026,
      continueNextYear: false,
      note: "Full year receipt",
    },
    "year-admin",
    new Date("2026-10-01T00:00:00Z"),
  );
  expect(
    await generateMonthlyRent(
      "leaving-student",
      new Date("2028-03-01T00:00:00Z"),
    ),
  ).toBe(0);
  await changeYearCoverage(
    {
      userId: "leaving-student",
      id,
      revision: 0,
      action: "renewal",
      continueNextYear: true,
      note: "Returned August",
    },
    "year-admin",
    new Date("2027-09-01T00:00:00Z"),
  );
  const fees = await db
    .select()
    .from(schema.feeDues)
    .where(eq(schema.feeDues.userId, "leaving-student"));
  expect(fees.map((f) => f.rentMonth).sort()).toEqual([
    "2026-10",
    "2027-08",
    "2027-09",
  ]);
});
it("preserves verified collections and extra fees, and blocks unresolved payments", async () => {
  await db.insert(schema.users).values({
    id: "payments-year",
    name: "Payments",
    email: "paymentsyear@example.test",
    role: "student",
    approvalStatus: "accepted",
    acceptedAt: new Date("2026-09-01T00:00:00Z"),
  });
  const now = new Date("2026-10-01T00:00:00Z");
  await generateMonthlyRent("payments-year", now);
  const [fee] = await db
    .select()
    .from(schema.feeDues)
    .where(eq(schema.feeDues.userId, "payments-year"));
  await db.insert(schema.feeDues).values({
    id: "extra-year",
    userId: "payments-year",
    label: "Extra fee",
    amount: 50000,
    dueDate: "2026-10-31",
  });
  await db.insert(schema.payments).values({
    id: "pending-year",
    userId: "payments-year",
    feeDueId: fee.id,
    amount: 40000,
    method: "admin_manual",
    status: "pending",
  });
  const input = {
    userId: "payments-year",
    startYear: 2026,
    continueNextYear: true,
    note: "Annual payment receipt",
  };
  await expect(recordYearCoverage(input, "year-admin", now)).rejects.toThrow(
    "resolve existing payment",
  );
  expect(
    await db
      .select()
      .from(schema.rentCoverage)
      .where(eq(schema.rentCoverage.userId, input.userId)),
  ).toHaveLength(0);
  await db
    .update(schema.payments)
    .set({ status: "verified" })
    .where(eq(schema.payments.id, "pending-year"));
  const id = await recordYearCoverage(input, "year-admin", now);
  const [covered] = await db
    .select()
    .from(schema.feeDues)
    .where(eq(schema.feeDues.id, fee.id));
  expect(covered.waivedAmount).toBe(60000);
  const [extra] = await db
    .select()
    .from(schema.feeDues)
    .where(eq(schema.feeDues.id, "extra-year"));
  expect(extra.waivedAmount).toBe(0);
  await changeYearCoverage(
    {
      userId: input.userId,
      id,
      revision: 0,
      action: "revoke",
      note: "Receipt correction",
    },
    "year-admin",
    now,
  );
  const [payment] = await db
    .select()
    .from(schema.payments)
    .where(eq(schema.payments.id, "pending-year"));
  expect([payment.status, payment.amount]).toEqual(["verified", 40000]);
});
it("retains the departure gap when a student returns in a later academic year", async () => {
  await db
    .insert(schema.users)
    .values({
      id: "return-year",
      name: "Returning",
      email: "returnyear@example.test",
      role: "student",
      approvalStatus: "accepted",
      acceptedAt: new Date("2026-09-01T00:00:00Z"),
    });
  await recordYearCoverage(
    {
      userId: "return-year",
      startYear: 2026,
      continueNextYear: false,
      note: "First year paid",
    },
    "year-admin",
    new Date("2026-10-01T00:00:00Z"),
  );
  await recordYearCoverage(
    {
      userId: "return-year",
      startYear: 2028,
      continueNextYear: true,
      note: "Returned and paid",
    },
    "year-admin",
    new Date("2028-08-01T00:00:00Z"),
  );
  expect(
    await generateMonthlyRent("return-year", new Date("2029-08-01T00:00:00Z")),
  ).toBe(1);
  const fees = await db
    .select()
    .from(schema.feeDues)
    .where(eq(schema.feeDues.userId, "return-year"));
  expect(fees.map((f) => f.rentMonth).sort()).toEqual(["2026-10", "2029-08"]);
});
