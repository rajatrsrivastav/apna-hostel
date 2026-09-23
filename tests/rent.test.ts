import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { eq } from "drizzle-orm";
import * as schema from "@/db/schema";

const shared = vi.hoisted(() => ({ db: undefined as unknown }));
vi.mock("@/db", () => ({ getDb: () => shared.db }));
import { generateMonthlyRent } from "@/lib/rent";
let client: PGlite;
let db: ReturnType<typeof drizzle<typeof schema>>;
beforeAll(async () => {
  client = new PGlite();
  db = drizzle(client, { schema });
  shared.db = db;
  await migrate(db, { migrationsFolder: "./drizzle" });
});
afterAll(async () => { await client.close(); });

it("generates one ₹1000 fee per month without duplicating prior dues", async () => {
  await db.insert(schema.users).values({
    id: "rent-student", name: "Rent student", email: "rent@example.test",
    role: "student", approvalStatus: "accepted", monthlyRent: 100_000,
    acceptedAt: new Date("2026-08-10T00:00:00Z"),
  });
  expect(await generateMonthlyRent("rent-student", new Date("2026-09-24T00:00:00Z"))).toBe(2);
  expect(await generateMonthlyRent("rent-student", new Date("2026-09-24T00:00:00Z"))).toBe(0);
  const dues = await db.select().from(schema.feeDues).where(eq(schema.feeDues.userId, "rent-student"));
  expect(dues.map(f => [f.rentMonth, f.amount]).sort()).toEqual([
    ["2026-08", 100_000], ["2026-09", 100_000],
  ]);
});
