import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { payments } from "@/db/schema";
import { requireUser } from "@/lib/access";
import { AppError, errorResponse } from "@/lib/errors";
import { storage } from "@/lib/storage";
export const runtime = "nodejs";
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const [payment] = await getDb()
      .select()
      .from(payments)
      .where(eq(payments.id, id));
    if (!payment || (payment.userId !== user.id && user.role !== "admin"))
      throw new AppError("Screenshot not found.", 404);
    if (!payment.screenshotPublicId)
      throw new AppError("Screenshot is not available yet.", 404);
    // Proxy authenticated delivery: no permanent signed asset URL is exposed.
    const url = storage().url(payment.screenshotPublicId, {
      type: "authenticated",
      secure: true,
      sign_url: true,
    });
    const response = await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok)
      throw new AppError("Screenshot could not be loaded.", 502);
    return new Response(response.body, {
      headers: {
        "Content-Type": response.headers.get("content-type") ?? "image/jpeg",
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Disposition": 'inline; filename="payment-screenshot"',
        "Content-Security-Policy": "default-src 'none'; sandbox",
      },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
