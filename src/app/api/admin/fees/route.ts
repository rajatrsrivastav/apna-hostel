import { rateLimit } from "@/lib/rate-limit";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { feeDues, payments, studentProfiles, users } from "@/db/schema";
import { requireAdmin } from "@/lib/access";
import { AppError } from "@/lib/errors";
import { mutation, jsonBody } from "@/lib/http";
import {
  feeSchema,
  idSchema,
  amountSchema,
  dateSchema,
} from "@/lib/validation";
import { generateMonthlyRent } from "@/lib/rent";
import { configuredRole } from "@/lib/env";
import { lockFee, feeBalance } from "@/lib/ledger";
export const POST = mutation(async (req) => {
  const admin = await requireAdmin();
  await rateLimit(admin.id, "admin/fees", 30);
  const values = feeSchema.parse(await jsonBody(req));
  const [student] = await getDb()
    .select()
    .from(users)
    .where(eq(users.id, values.userId));
  if (student?.role !== "student" || student.approvalStatus !== "accepted")
    throw new AppError("Accept the student before assigning fees.", 403);
  const [profile] = await getDb()
    .select()
    .from(studentProfiles)
    .where(eq(studentProfiles.userId, values.userId));
  if (!profile) throw new AppError("Student must finish their profile first.");
  await getDb()
    .insert(feeDues)
    .values({ ...values, id: crypto.randomUUID(), adjustedBy: admin.id });
  return Response.json({ ok: true });
});
export const PATCH = mutation(async (req) => {
  const admin = await requireAdmin();
  await rateLimit(admin.id, "admin/fees", 30);
  const body = await jsonBody(req);
  if (
    body &&
    typeof body === "object" &&
    "action" in body &&
    body.action === "monthlyRent"
  ) {
    const values = z
      .object({
        action: z.literal("monthlyRent"),
        userId: idSchema,
        amount: amountSchema,
        previousAmount: z.number().int().positive(),
      })
      .parse(body);
    await getDb().transaction(async (tx) => {
      const [student] = await tx
        .select()
        .from(users)
        .where(eq(users.id, values.userId))
        .for("update");
      if (!student || configuredRole(student) === "admin")
        throw new AppError("Student account required.", 403);
      if (student.monthlyRent !== values.previousAmount)
        throw new AppError("Monthly fee changed. Reload and try again.", 409);
      // Materialize all accrued months at the old rate before changing future rent.
      await generateMonthlyRent(student.id, new Date(), tx);
      await tx
        .update(users)
        .set({ monthlyRent: values.amount, updatedAt: new Date() })
        .where(eq(users.id, student.id));
    });
    return Response.json({ ok: true });
  }
  const values = z
    .object({
      id: idSchema,
      revision: z.number().int().nonnegative(),
      action: z.enum(["update", "paid", "unpaid"]),
      amount: amountSchema.optional(),
      dueDate: dateSchema.optional(),
      note: z.string().trim().min(3, "Add a short reason.").max(300),
    })
    .parse(body);
  await getDb().transaction(async (tx) => {
    const fee = await lockFee(tx, values.id);
    if (fee.revision !== values.revision)
      throw new AppError("This fee changed. Reload and try again.", 409);
    const [pending] = await tx
      .select()
      .from(payments)
      .where(
        and(eq(payments.feeDueId, fee.id), eq(payments.status, "pending")),
      );
    if (pending)
      throw new AppError(
        "Resolve the pending payment before changing this fee.",
        409,
      );
    const outstanding = await feeBalance(tx, fee);
    const [totals] = await tx
      .select({ paid: sql<number>`coalesce(sum(${payments.amount}), 0)::int` })
      .from(payments)
      .where(
        and(eq(payments.feeDueId, fee.id), eq(payments.status, "verified")),
      );
    const paid = totals.paid;
    if (
      values.action === "update" &&
      (values.amount === undefined || !values.dueDate)
    )
      throw new AppError("Enter amount and due date.");
    if (values.action === "update" && values.amount! < paid + fee.waivedAmount)
      throw new AppError(
        "Fee cannot be below payments and adjustments already recorded.",
      );
    if (values.action === "unpaid" && fee.waivedAmount === 0)
      throw new AppError(
        "There is no manual adjustment to undo. Verified payments cannot be erased.",
      );
    await tx
      .update(feeDues)
      .set({
        ...(values.action === "update"
          ? { amount: values.amount, dueDate: values.dueDate }
          : {
              waivedAmount:
                values.action === "paid" ? fee.waivedAmount + outstanding : 0,
            }),
        adjustmentNote: values.note,
        adjustedBy: admin.id,
        adjustedAt: new Date(),
        audit: [
          ...fee.audit,
          {
            actor: admin.id,
            action: values.action,
            note: values.note,
            at: new Date().toISOString(),
            amount: fee.amount,
            waivedAmount: fee.waivedAmount,
            dueDate: fee.dueDate,
          },
        ],
        revision: fee.revision + 1,
      })
      .where(eq(feeDues.id, fee.id));
  });
  return Response.json({ ok: true });
});
