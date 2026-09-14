import { getAuth } from "@/lib/auth";
import { errorResponse } from "@/lib/errors";
export const runtime = "nodejs";
async function handler(request: Request) {
  try {
    return await getAuth().handler(request);
  } catch (e) {
    return errorResponse(e);
  }
}
export { handler as GET, handler as POST };
