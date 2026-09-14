import "server-only";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";
const globalDb = globalThis as unknown as { pgPool?: Pool };
export function getDb() {
  if (!process.env.DATABASE_URL)
    throw new Error("DATABASE_URL is not configured");
  const pool = (globalDb.pgPool ??= new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 5,
    idleTimeoutMillis: 20_000,
    connectionTimeoutMillis: 10_000,
  }));
  return drizzle(pool, { schema });
}
