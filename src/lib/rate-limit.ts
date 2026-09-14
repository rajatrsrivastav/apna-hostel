import "server-only";
import { sql } from "drizzle-orm";
import { getDb } from "@/db";
import { AppError } from "./errors";
export async function rateLimit(userId: string, action: string, max = 15) {
  const key = `portal:${action}:${userId}`,
    now = Date.now(),
    cutoff = now - 60_000;
  const result = await getDb().execute(
    sql`INSERT INTO rate_limits (id, key, count, last_request) VALUES (${crypto.randomUUID()}, ${key}, 1, ${now}) ON CONFLICT (key) DO UPDATE SET count = CASE WHEN rate_limits.last_request < ${cutoff} THEN 1 ELSE rate_limits.count + 1 END, last_request = CASE WHEN rate_limits.last_request < ${cutoff} THEN ${now} ELSE rate_limits.last_request END RETURNING count`,
  );
  if (Number(result.rows[0].count) > max)
    throw new AppError("Too many attempts. Please wait a minute.", 429);
}
