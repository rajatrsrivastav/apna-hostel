import { config } from "dotenv";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { assertSafeMigrations } from "./migration-safety";
config({ path: ".env.local", quiet: true });
config({ quiet: true });
async function main() {
  if (!process.env.DATABASE_URL) throw new Error("Set DATABASE_URL first.");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
  try {
    const {
      rows: [tables],
    } = await pool.query(
      "SELECT to_regclass('drizzle.__drizzle_migrations') AS migrations, to_regclass('public.users') AS users",
    );
    const lastApplied = tables.migrations
      ? Number(
          (
            await pool.query(
              "SELECT coalesce(max(created_at), 0) AS latest FROM drizzle.__drizzle_migrations",
            )
          ).rows[0].latest,
        )
      : 0;
    const hasUsers = tables.users
      ? Boolean(
          (
            await pool.query(
              "SELECT EXISTS(SELECT 1 FROM public.users) AS present",
            )
          ).rows[0].present,
        )
      : false;
    assertSafeMigrations(lastApplied, hasUsers);
    await migrate(drizzle(pool), { migrationsFolder: "./drizzle" });
    console.log("Database migrations applied.");
  } finally {
    await pool.end();
  }
}
main().catch((err) => {
  console.error(
    "Migration failed:",
    err instanceof Error && err.message.startsWith("Pending data-deletion")
      ? err.message
      : "Check database configuration and migration history. No credentials are logged.",
  );
  process.exitCode = 1;
});
