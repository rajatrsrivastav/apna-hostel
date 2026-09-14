import { config } from "dotenv";
import { Pool } from "pg";
import { z } from "zod";
config({ path: ".env.local" });
config();
async function main() {
  const emails = (process.env.ADMIN_EMAILS ?? process.env.ADMIN_EMAIL ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean)
    .map((email) => z.email().parse(email));
  if (!emails.length) throw new Error("Set ADMIN_EMAILS first.");
  if (!process.env.DATABASE_URL) throw new Error("Set DATABASE_URL first.");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
  try {
    const result = await pool.query(
      "UPDATE users SET role = 'admin', updated_at = now() WHERE lower(trim(email)) = ANY($1::text[]) AND email_verified = true RETURNING id",
      [emails],
    );
    if (!result.rowCount)
      throw new Error(
        "Sign in with the admin Google account first, then run db:seed. No user was promoted.",
      );
    console.log("Verified Google account promoted to admin.");
  } finally {
    await pool.end();
  }
}
main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
