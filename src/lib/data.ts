import "server-only";
import { and, desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { feeDues, payments, studentProfiles, users } from "@/db/schema";
import { generateMonthlyRent, indiaMonth } from "./rent";
import { balance, feeStatus } from "./money";
export async function studentData(userId: string) {
  await generateMonthlyRent(userId);
  const db = getDb();
  const [fees, history] = await Promise.all([
    db
      .select()
      .from(feeDues)
      .where(eq(feeDues.userId, userId))
      .orderBy(feeDues.dueDate),
    db
      .select()
      .from(payments)
      .where(eq(payments.userId, userId))
      .orderBy(desc(payments.createdAt)),
  ]);
  const dues = fees.map((fee) => {
    const related = history.filter((p) => p.feeDueId === fee.id);
    const paid = related
      .filter((p) => p.status === "verified")
      .reduce((s, p) => s + p.amount, 0);
    const outstanding = balance(fee.amount, paid, fee.waivedAmount);
    return {
      ...fee,
      paid,
      outstanding,
      status: feeStatus(
        outstanding,
        related.some((p) => p.status === "pending"),
      ),
      pending: related.find((p) => p.status === "pending"),
    };
  });
  return {
    dues,
    history,
    currentMonthRent: dues
      .filter((f) => f.rentMonth === indiaMonth())
      .reduce((s, f) => s + f.amount, 0),
    currentMonthDue: dues
      .filter((f) => f.rentMonth === indiaMonth())
      .reduce((s, f) => s + f.outstanding, 0),
    previousDue: dues
      .filter((f) => f.rentMonth !== indiaMonth())
      .reduce((s, f) => s + f.outstanding, 0),
    totalDue: dues.reduce((s, f) => s + f.outstanding, 0),
    totalPaid: history
      .filter((p) => p.status === "verified")
      .reduce((s, p) => s + p.amount, 0),
  };
}
export async function adminStudents() {
  await generateMonthlyRent();
  // Aggregate before joining to avoid multiplying fees by payment count.
  const result = await getDb().execute(sql`
    WITH paid_by_fee AS (SELECT fee_due_id, sum(amount) FILTER (WHERE status = 'verified') AS paid FROM payments GROUP BY fee_due_id),
    fees AS (SELECT f.user_id, sum(greatest(0, f.amount - f.waived_amount - coalesce(p.paid,0))) AS outstanding FROM fee_dues f LEFT JOIN paid_by_fee p ON p.fee_due_id=f.id GROUP BY f.user_id),
    history AS (SELECT user_id, sum(amount) FILTER (WHERE status='verified') AS paid, bool_or(status='pending') AS pending, max(reviewed_at) FILTER (WHERE status='verified') AS last_payment FROM payments GROUP BY user_id)
    SELECT u.id, u.email, coalesce(s.full_name,u.name) AS name, s.phone, s.course, s.trade, s.study_year,
    coalesce(f.outstanding,0)::int AS outstanding, coalesce(h.paid,0)::int AS paid, coalesce(h.pending,false) AS pending, h.last_payment
    FROM users u LEFT JOIN student_profiles s ON s.user_id=u.id LEFT JOIN fees f ON f.user_id=u.id LEFT JOIN history h ON h.user_id=u.id WHERE u.role='student' AND u.approval_status='accepted' ORDER BY u.created_at DESC`);
  return (
    result.rows as unknown as {
      id: string;
      email: string;
      name: string;
      phone: string | null;
      course: string | null;
      trade: string | null;
      study_year: string | null;
      outstanding: number;
      paid: number;
      pending: boolean;
      last_payment: Date | null;
    }[]
  ).map((s) => ({ ...s, status: feeStatus(s.outstanding, s.pending) }));
}
export async function getStudent(id: string) {
  const [row] = await getDb()
    .select({ user: users, profile: studentProfiles })
    .from(users)
    .leftJoin(studentProfiles, eq(users.id, studentProfiles.userId))
    .where(and(eq(users.id, id), eq(users.role, "student")));
  return row;
}

export async function pendingStudents() {
  return getDb()
    .select({ user: users, profile: studentProfiles })
    .from(users)
    .innerJoin(studentProfiles, eq(users.id, studentProfiles.userId))
    .where(and(eq(users.role, "student"), eq(users.approvalStatus, "pending")))
    .orderBy(desc(users.createdAt));
}
