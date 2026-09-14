import { reviewLoginEnabled } from "@/lib/env";
import { getAuth } from "@/lib/auth";
import { errorResponse } from "@/lib/errors";
export const runtime = "nodejs";
async function handler(request: Request) {
  if (
    new URL(request.url).pathname === "/api/auth/review-login" &&
    !reviewLoginEnabled()
  )
    return new Response(null, {
      status: 404,
      headers: { "Cache-Control": "private, no-store" },
    });
  try {
    return await getAuth().handler(request);
  } catch (e) {
    return errorResponse(e);
  }
}
export { handler as GET, handler as POST };
