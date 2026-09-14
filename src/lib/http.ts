import "server-only";
import { AppError, errorResponse } from "./errors";
import { requiredEnv } from "./env";
export function checkOrigin(request: Request) {
  if (
    request.headers.get("origin") !==
    new URL(requiredEnv("BETTER_AUTH_URL")).origin
  )
    throw new AppError("Please reload this page and try again.", 403);
}
export async function jsonBody(request: Request) {
  if (!request.headers.get("content-type")?.includes("application/json"))
    throw new AppError("JSON body required.", 415);
  const body = await limitedBody(request, 16_384);
  try {
    return JSON.parse(body.toString("utf8"));
  } catch {
    throw new AppError("Invalid request.");
  }
}
export async function limitedBody(request: Request, limit: number) {
  if (Number(request.headers.get("content-length")) > limit)
    throw new AppError("File or request is too large.", 413);
  const reader = request.body?.getReader();
  if (!reader) return Buffer.alloc(0);
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > limit) {
      await reader.cancel();
      throw new AppError("File or request is too large.", 413);
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}
export function mutation(fn: (req: Request) => Promise<Response>) {
  return async (req: Request) => {
    try {
      checkOrigin(req);
      const response = await fn(req);
      response.headers.set("Cache-Control", "private, no-store");
      return response;
    } catch (e) {
      return errorResponse(e);
    }
  };
}
