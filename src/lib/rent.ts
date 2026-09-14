import "server-only";
import { sql } from "drizzle-orm";
import { getDb } from "@/db";
import type { Transaction } from "./ledger";
export const MONTHLY_RENT = 100_000;
export function indiaMonth(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(now);
  return `${parts.find((p) => p.type === "year")!.value}-${parts.find((p) => p.type === "month")!.value}`;
}
// Lock users before fees everywhere approval and rent interact. Unpaid months
// remain separate dues: carry-forward is a sum, never another copy of the debt.
export async function generateMonthlyRentWithIds(
  userId?: string,
  now = new Date(),
  executor: Pick<Transaction, "execute"> = getDb(),
) {
  const result = await executor.execute(sql`
    WITH eligible AS MATERIALIZED (
      SELECT id, accepted_at, monthly_rent FROM users
      WHERE role = 'student' AND approval_status = 'accepted' AND accepted_at IS NOT NULL
      ${userId ? sql`AND id = ${userId}` : sql``}
      ORDER BY id FOR UPDATE
    )
    INSERT INTO fee_dues (id, user_id, label, amount, due_date, rent_month)
    SELECT gen_random_uuid()::text, u.id, 'Rent · ' || to_char(m.month, 'Mon YYYY'), u.monthly_rent,
      to_char(m.month + interval '1 month - 1 day', 'YYYY-MM-DD'), to_char(m.month, 'YYYY-MM')
    FROM eligible u CROSS JOIN LATERAL generate_series(
      date_trunc('month', u.accepted_at AT TIME ZONE 'Asia/Kolkata'),
      date_trunc('month', ${now.toISOString()}::timestamptz AT TIME ZONE 'Asia/Kolkata'), interval '1 month'
    ) m(month)
    ON CONFLICT (user_id, rent_month) DO NOTHING RETURNING id`);
  return {
    count: result.rows.length,
    createdIds: (result.rows as unknown as { id: string }[]).map((r) => r.id),
  };
}

export async function generateMonthlyRent(
  userId?: string,
  now = new Date(),
  executor: Pick<Transaction, "execute"> = getDb(),
) {
  const { count } = await generateMonthlyRentWithIds(userId, now, executor);
  return count;
}
