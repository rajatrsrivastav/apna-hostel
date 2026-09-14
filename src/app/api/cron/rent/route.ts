import { timingSafeEqual } from "node:crypto";
import { generateMonthlyRent } from "@/lib/rent";
import { errorResponse } from "@/lib/errors";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const provided = Buffer.from(req.headers.get("authorization") || "");
  const expected = Buffer.from(`Bearer ${secret}`);
  if (
    !secret ||
    provided.length !== expected.length ||
    !timingSafeEqual(provided, expected)
  )
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const created = await generateMonthlyRent();
    return Response.json(
      { created },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return errorResponse(e);
  }
}
