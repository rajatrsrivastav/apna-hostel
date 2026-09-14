import { ZodError } from "zod";
export class AppError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export function errorResponse(error: unknown) {
  if (error instanceof ZodError)
    return Response.json(
      { error: error.issues[0]?.message ?? "Check your details." },
      { status: 400 },
    );
  if (error instanceof AppError)
    return Response.json({ error: error.message }, { status: error.status });
  const incident = crypto.randomUUID();
  // Do not log tokens, request bodies, screenshots, names, or payment signatures.
  console.error(
    JSON.stringify({
      level: "error",
      incident,
      type: error instanceof Error ? error.name : "UnknownError",
      code:
        typeof error === "object" && error && "code" in error
          ? String(error.code)
          : undefined,
    }),
  );
  return Response.json(
    {
      error: `Something went wrong. Please try again. Reference: ${incident.slice(0, 8)}`,
    },
    { status: 500 },
  );
}
