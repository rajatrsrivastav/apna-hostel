import { config } from "dotenv";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { Client } from "pg";
import { FEE_COLLECTION_START_DATE } from "../src/lib/fee-policy";

config({ path: ".env.local", quiet: true });
config({ quiet: true });

const reviewerEmail = "cashfree.reviewer@example.com";
const reviewerPhone = "9999999999";
const reviewerAccountId = "cashfree-review-test-student";
const cutoff = `${FEE_COLLECTION_START_DATE}T00:00:00+05:30`;
const execute = process.argv.includes("--execute");
// Retained students' September dues require separate, explicit approval.
const includeRetainedStudentDues = process.argv.includes("--include-retained-student-dues");
function requiredManifestPath() {
  const index = process.argv.indexOf("--manifest");
  const path = index < 0 ? undefined : process.argv[index + 1];
  if (!path || path.startsWith("--"))
    throw new Error("Use --manifest <path>. Preview writes the exact record list; --execute requires that same file.");
  return path;
}
const manifestPath = requiredManifestPath();
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");

const client = new Client({ connectionString: process.env.DATABASE_URL });
const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

async function inventory(lock: boolean) {
  const reviewer = await client.query(
    `SELECT u.id, u.name, u.email, u.role, s.phone
     FROM users u LEFT JOIN student_profiles s ON s.user_id = u.id
     WHERE lower(u.email) = $1 ${lock ? "FOR UPDATE OF u" : ""}`,
    [reviewerEmail],
  );
  if (reviewer.rows.length > 1) throw new Error("Duplicate reviewer email; stopped.");
  const account = reviewer.rows[0] ?? null;
  if (account && (account.id !== reviewerAccountId || account.role !== "student" || account.phone !== reviewerPhone))
    throw new Error("Reviewer identity differs from the expected account ID, student role or phone; stopped.");
  const reviewerId: string | null = account?.id ?? null;
  const payments = await client.query(
    `SELECT p.id, p.user_id, u.email, p.fee_due_id, p.amount, p.status,
            p.attempt_status, p.cashfree_order_id, p.created_at
     FROM payments p JOIN users u ON u.id = p.user_id
     WHERE p.created_at < $1::timestamptz OR p.user_id = $2
     ORDER BY p.id ${lock ? "FOR UPDATE OF p" : ""}`,
    [cutoff, reviewerId],
  );
  const dues = await client.query(
    `SELECT f.id, f.user_id, u.email, f.rent_month, f.due_date, f.amount
     FROM fee_dues f JOIN users u ON u.id = f.user_id
     WHERE f.user_id = $3 OR ($4::boolean AND u.role = 'student'
       AND lower(u.email) IN ('rampalyadavtata1434@gmail.com', 'himanshumaddeshiya2@gmail.com')
       AND (f.rent_month < $1 OR f.due_date < $2))
     ORDER BY f.id ${lock ? "FOR UPDATE OF f" : ""}`,
    [FEE_COLLECTION_START_DATE.slice(0, 7), FEE_COLLECTION_START_DATE, reviewerId, includeRetainedStudentDues],
  );
  const paymentIds = payments.rows.map((row) => row.id as string);
  const dueIds = dues.rows.map((row) => row.id as string);
  const retained = await client.query(
    `SELECT id FROM payments WHERE fee_due_id = ANY($1::text[]) AND NOT (id = ANY($2::text[]))`,
    [dueIds, paymentIds],
  );
  if (retained.rowCount) throw new Error("A fee scheduled for deletion has a payment outside the requested cutoff; stopped.");
  return { cutoff, includeRetainedStudentDues, reviewer: account, payments: payments.rows, dues: dues.rows };
}

async function main() {
await client.connect();
try {
  await client.query(`BEGIN ISOLATION LEVEL SERIALIZABLE ${execute ? "" : "READ ONLY"}`);
  if (execute) {
    // Block concurrent inserts and settlements until the reviewed snapshot is deleted.
    await client.query("LOCK TABLE payments, fee_dues, users, student_profiles IN SHARE ROW EXCLUSIVE MODE");
  }
  const current = await inventory(execute);
  if (!execute) {
    await writeFile(manifestPath, JSON.stringify({ hash: digest(current), inventory: current }, null, 2), { mode: 0o600 });
    await client.query("COMMIT");
    console.log(JSON.stringify({ manifest: manifestPath, ...current }, null, 2));
  } else {
    if (current.payments.some((row) => row.status === "pending" || (row.attempt_status === "paid" && row.status !== "verified")))
      throw new Error("An in-scope Cashfree payment is pending or captured but unresolved; reconcile it before cleanup.");
    const approved = JSON.parse(await readFile(manifestPath, "utf8"));
    if (approved.hash !== digest(approved.inventory) || approved.hash !== digest(current))
      throw new Error("Live records changed since preview. Create and review a new manifest; nothing was deleted.");
    const paymentIds = current.payments.map((row) => row.id as string);
    const dueIds = current.dues.map((row) => row.id as string);
    await client.query("DELETE FROM payments WHERE id = ANY($1::text[])", [paymentIds]);
    await client.query("DELETE FROM fee_dues WHERE id = ANY($1::text[])", [dueIds]);
    if (current.reviewer) {
      const id = current.reviewer.id as string;
      await client.query("DELETE FROM student_profiles WHERE user_id = $1", [id]);
      await client.query("DELETE FROM users WHERE id = $1 AND role = 'student'", [id]);
    }
    await client.query("COMMIT");
    console.log(JSON.stringify({ deletedPaymentIds: paymentIds, deletedFeeDueIds: dueIds, deletedReviewerId: current.reviewer?.id ?? null }, null, 2));
  }
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  await client.end();
}
}
main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
