import { z } from "zod";
import { requireAdmin } from "@/lib/access";
import { jsonBody, mutation } from "@/lib/http";
import { idSchema } from "@/lib/validation";
import { rateLimit } from "@/lib/rate-limit";
import { changeYearCoverage, recordYearCoverage } from "@/lib/year-coverage";

const note = z
  .string()
  .trim()
  .min(3, "Add a receipt/reference or reason.")
  .max(300);
export const POST = mutation(async (req) => {
  const admin = await requireAdmin();
  await rateLimit(admin.id, "admin/year-coverage", 30);
  const values = z
    .object({
      userId: idSchema,
      startYear: z.coerce.number().int(),
      continueNextYear: z.boolean(),
      note,
      feeId: idSchema.optional(),
      feeRevision: z.number().int().nonnegative().optional(),
    })
    .parse(await jsonBody(req));
  const id = await recordYearCoverage(values, admin.id);
  return Response.json({ ok: true, id });
});
export const PATCH = mutation(async (req) => {
  const admin = await requireAdmin();
  await rateLimit(admin.id, "admin/year-coverage", 30);
  const values = z
    .discriminatedUnion("action", [
      z.object({
        action: z.literal("renewal"),
        userId: idSchema,
        id: idSchema,
        revision: z.number().int().nonnegative(),
        continueNextYear: z.boolean(),
        note,
      }),
      z.object({
        action: z.literal("revoke"),
        userId: idSchema,
        id: idSchema,
        revision: z.number().int().nonnegative(),
        note,
      }),
    ])
    .parse(await jsonBody(req));
  await changeYearCoverage(values, admin.id);
  return Response.json({ ok: true });
});
