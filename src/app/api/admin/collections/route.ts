import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { users, payments } from "@/db/schema";
import { requireAdmin } from "@/lib/access";
import { mutation, jsonBody } from "@/lib/http";
import { AppError } from "@/lib/errors";
import {
  amountSchema,
  dateSchema,
  idSchema,
  todayIndia,
} from "@/lib/validation";
import { lockFee, feeBalance } from "@/lib/ledger";
import { rateLimit } from "@/lib/rate-limit";
const fields = {
  amount: amountSchema,
  paymentDate: dateSchema.refine(
    (d) => d <= todayIndia(),
    "Payment date cannot be in the future.",
  ),
  note: z.string().trim().min(3, "Add a reason or payment reference.").max(300),
};
export const POST = mutation(async (req) => {
  const admin = await requireAdmin();
  await rateLimit(admin.id, "collections", 30);
  const input = z
    .object({ ...fields, id: z.uuid(), feeDueId: idSchema })
    .parse(await jsonBody(req));
  const result = await getDb().transaction(async (tx) => {
    const fee = await lockFee(tx, input.feeDueId);
    const [student] = await tx
      .select()
      .from(users)
      .where(eq(users.id, fee.userId));
    if (student?.role !== "student" || student.approvalStatus !== "accepted")
      throw new AppError(
        "Only accepted students can receive new collections.",
        403,
      );
    const [existing] = await tx
      .select()
      .from(payments)
      .where(eq(payments.id, input.id));
    if (existing) {
      if (
        existing.method !== "admin_manual" ||
        existing.feeDueId !== fee.id ||
        existing.amount !== input.amount ||
        existing.paymentDate !== input.paymentDate
      )
        throw new AppError("Request already used. Reload first.", 409);
      return existing;
    }
    const [pending] = await tx
      .select()
      .from(payments)
      .where(
        and(eq(payments.feeDueId, fee.id), eq(payments.status, "pending")),
      );
    if (pending)
      throw new AppError(
        "Resolve the pending payment before recording a collection.",
        409,
      );
    if (input.amount > (await feeBalance(tx, fee)))
      throw new AppError("Collection exceeds this fee’s remaining balance.");
    const [payment] = await tx
      .insert(payments)
      .values({
        id: input.id,
        userId: fee.userId,
        feeDueId: fee.id,
        amount: input.amount,
        paymentDate: input.paymentDate,
        method: "admin_manual",
        status: "verified",
        reviewedBy: admin.id,
        reviewedAt: new Date(),
        reviewNote: input.note,
      })
      .returning();
    return payment;
  });
  return Response.json({ id: result.id });
});
export const PATCH = mutation(async (req) => {
  const admin = await requireAdmin();
  await rateLimit(admin.id, "collections", 30);
  const input = z
    .object({
      ...fields,
      amount: z.union([
        amountSchema,
        z
          .string()
          .regex(/^0(?:\.0{1,2})?$/)
          .transform(() => 0),
      ]),
      id: idSchema,
      revision: z.number().int().nonnegative(),
    })
    .parse(await jsonBody(req));
  const [initial] = await getDb()
    .select()
    .from(payments)
    .where(eq(payments.id, input.id));
  if (!initial || initial.method !== "admin_manual")
    throw new AppError("Only admin-recorded collections can be edited.", 403);
  await getDb().transaction(async (tx) => {
    const fee = await lockFee(tx, initial.feeDueId);
    const [payment] = await tx
      .select()
      .from(payments)
      .where(eq(payments.id, input.id));
    if (payment.revision !== input.revision)
      throw new AppError("This collection changed. Reload first.", 409);
    const [pending] = await tx
      .select()
      .from(payments)
      .where(
        and(eq(payments.feeDueId, fee.id), eq(payments.status, "pending")),
      );
    if (pending)
      throw new AppError(
        "Resolve the pending payment before editing collections.",
        409,
      );
    const available =
      (await feeBalance(tx, fee)) +
      (payment.status === "verified" ? payment.amount : 0);
    if (input.amount > available)
      throw new AppError("Collection exceeds the fee balance.");
    await tx
      .update(payments)
      .set({
        amount: input.amount || payment.amount,
        status: input.amount === 0 ? "rejected" : "verified",
        paymentDate: input.paymentDate,
        reviewNote: input.note,
        reviewedBy: admin.id,
        reviewedAt: new Date(),
        revision: payment.revision + 1,
        adminAudit: [
          ...payment.adminAudit,
          {
            actor: admin.id,
            at: new Date().toISOString(),
            note: input.note,
            previousAmount: payment.amount,
            previousDate: payment.paymentDate,
            previousStatus: payment.status,
            previousNote: payment.reviewNote,
          },
        ],
      })
      .where(eq(payments.id, payment.id));
  });
  return Response.json({ ok: true });
});
