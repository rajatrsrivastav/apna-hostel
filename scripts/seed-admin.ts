import { config } from "dotenv";
import { Pool } from "pg";
import { z } from "zod";
config({ path: ".env.local" });
config();
async function main() {
  const email = z.email().parse(process.env.ADMIN_EMAIL).toLowerCase();
  if (!process.env.DATABASE_URL) throw new Error("Set DATABASE_URL first.");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
  try {
    const result = await pool.query(
      "UPDATE users SET role = 'admin', updated_at = now() WHERE lower(email) = $1 AND email_verified = true RETURNING id",
      [email],
    );
    if (result.rowCount !== 1)
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
