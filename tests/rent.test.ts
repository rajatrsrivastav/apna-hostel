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
afterAll(async () => { await client.close(); });

it("recovers missing earlier months even when the current month already exists", async () => {
  await db.insert(schema.users).values({
    id: "catchup-student", name: "Catch-up student", email: "catchup@example.test",
    role: "student", approvalStatus: "accepted", monthlyRent: 100_000,
    acceptedAt: new Date("2026-09-15T00:00:00Z"),
  });
  await db.insert(schema.feeDues).values({
    id: "existing-december", userId: "catchup-student", label: "Rent · Dec 2026",
    amount: 100_000, dueDate: "2026-12-31", rentMonth: "2026-12",
  });
  const now = new Date("2026-12-15T00:00:00Z");
  expect(await generateMonthlyRent("catchup-student", now)).toBe(2);
  expect(await generateMonthlyRent("catchup-student", now)).toBe(0);
  const dues = await db.select().from(schema.feeDues).where(eq(schema.feeDues.userId, "catchup-student"));
  expect(dues.map(f => f.rentMonth).sort()).toEqual(["2026-10", "2026-11", "2026-12"]);
});

it("starts ₹1000 monthly rent on 1 October 2026 and avoids duplicates", async () => {
  await db.insert(schema.users).values({
    id: "rent-student", name: "Rent student", email: "rent@example.test",
    role: "student", approvalStatus: "accepted", monthlyRent: 100_000,
    acceptedAt: new Date("2026-08-10T00:00:00Z"),
  });
  expect(await generateMonthlyRent("rent-student", new Date("2026-09-24T00:00:00Z"))).toBe(0);
  expect(await generateMonthlyRent("rent-student", new Date("2026-09-24T00:00:00Z"))).toBe(0);
  expect(await generateMonthlyRent("rent-student", new Date("2026-09-30T18:29:59Z"))).toBe(0);
  expect(await generateMonthlyRent("rent-student", new Date("2026-09-30T18:30:00Z"))).toBe(1);
  expect(await generateMonthlyRent("rent-student", new Date("2026-10-15T00:00:00Z"))).toBe(0);
  expect(await generateMonthlyRent("rent-student", new Date("2026-11-01T00:00:00Z"))).toBe(1);
  const dues = await db.select().from(schema.feeDues).where(eq(schema.feeDues.userId, "rent-student"));
  expect(dues.map(f => [f.rentMonth, f.amount]).sort()).toEqual([
    ["2026-10", 100_000], ["2026-11", 100_000],
  ]);
});

it("shows no admin outstanding before October, then charges only October rent", async () => {
  await db.insert(schema.users).values({
    id: "dashboard-student", name: "Dashboard student", email: "dashboard@example.test",
    role: "student", approvalStatus: "accepted", monthlyRent: 100_000,
    acceptedAt: new Date("2026-09-01T00:00:00Z"),
  });
  await db.insert(schema.feeDues).values({
    id: "old-september-due", userId: "dashboard-student", label: "Rent · Sep 2026",
    amount: 100_000, dueDate: "2026-09-30", rentMonth: "2026-09",
  });
  vi.useFakeTimers();
  try {
    vi.setSystemTime(new Date("2026-09-30T18:29:59Z"));
    expect((await adminStudents()).find((student) => student.id === "dashboard-student")?.outstanding).toBe(0);
    vi.setSystemTime(new Date("2026-09-30T18:30:00Z"));
    expect((await adminStudents()).find((student) => student.id === "dashboard-student")?.outstanding).toBe(100_000);
  } finally {
    vi.useRealTimers();
  }
});

it("generates the October rent for the Cashfree review student after launch", async () => {
  await db.insert(schema.users).values({
    id: "cashfree-review-test-student", name: "Review student", email: "review@example.test",
    role: "student", approvalStatus: "accepted", monthlyRent: 100_000,
    acceptedAt: new Date("2026-09-15T00:00:00Z"),
  });
  process.env.ENABLE_CASHFREE_REVIEW_LOGIN = "true";
  try {
    expect(await generateMonthlyRent("cashfree-review-test-student", new Date("2026-09-29T12:00:00Z"))).toBe(0);
    expect(await generateMonthlyRent("cashfree-review-test-student", new Date("2026-10-01T00:00:00Z"))).toBe(1);
    const dues = await db.select().from(schema.feeDues).where(eq(schema.feeDues.userId, "cashfree-review-test-student"));
    expect(dues.map(f => [f.rentMonth, f.amount])).toEqual([["2026-10", 100_000]]);
  } finally {
    delete process.env.ENABLE_CASHFREE_REVIEW_LOGIN;
  }
});
