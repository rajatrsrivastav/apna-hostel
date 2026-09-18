import { config } from "dotenv";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
config({ path: ".env.local" });
config();
async function main() {
  if (!process.env.DATABASE_URL) throw new Error("Set DATABASE_URL first.");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
  try {
    await migrate(drizzle(pool), { migrationsFolder: "./drizzle" });
    console.log("Database migrations applied.");
  } finally {
    await pool.end();
  }
}
main().catch((err) => {
  console.error("Migration failed:", err);
  process.exitCode = 1;
});
