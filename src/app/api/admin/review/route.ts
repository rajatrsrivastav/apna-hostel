import { rateLimit } from "@/lib/rate-limit";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { payments } from "@/db/schema";
import { requireAdmin } from "@/lib/access";
import { AppError } from "@/lib/errors";
import { jsonBody, mutation } from "@/lib/http";
import { idSchema } from "@/lib/validation";
import { lockFee, feeBalance } from "@/lib/ledger";
import {
  notifyPaymentSuccess,
  notifyPaymentRejected,
} from "@/lib/notifications";
export const POST = mutation(async (req) => {
  const admin = await requireAdmin();
  await rateLimit(admin.id, "admin/review", 30);
  const values = z
    .object({
      id: idSchema,
      decision: z.enum(["verified", "rejected"]),
      note: z.string().trim().max(300).default(""),
    })
    .parse(await jsonBody(req));
  if (values.decision === "rejected" && values.note.length < 3)
    throw new AppError("Tell the student why this payment was rejected.");
  const [initial] = await getDb()
    .select()
    .from(payments)
    .where(eq(payments.id, values.id));
  if (!initial || initial.method !== "manual_upi")
    throw new AppError("Manual payment not found.", 404);
  await getDb().transaction(async (tx) => {
    const fee = await lockFee(tx, initial.feeDueId);
    const [payment] = await tx
      .select()
      .from(payments)
      .where(eq(payments.id, initial.id));
    if (payment.status === values.decision) return;
    if (payment.status !== "pending")
      throw new AppError("This payment was already reviewed.", 409);
    if (values.decision === "verified" && !payment.screenshotPublicId)
      throw new AppError(
        "Screenshot upload is incomplete. Ask the student to retry.",
      );
    if (
      values.decision === "verified" &&
      payment.amount > (await feeBalance(tx, fee))
    )
      throw new AppError(
        "Payment exceeds the remaining fee. Reconcile this with the student before approval.",
      );
    await tx
      .update(payments)
      .set({
        status: values.decision,
        reviewNote: values.note || null,
        reviewedBy: admin.id,
        reviewedAt: new Date(),
      })
      .where(eq(payments.id, payment.id));
  });
  if (values.decision === "verified") {
    try {
      await notifyPaymentSuccess(initial.id);
    } catch (err) {
      console.error("[Notification] notifyPaymentSuccess failed:", err);
    }
  } else if (values.decision === "rejected") {
    try {
      await notifyPaymentRejected(initial.id);
    } catch (err) {
      console.error("[Notification] notifyPaymentRejected failed:", err);
    }
  }
  return Response.json({ ok: true });
});

