import { rateLimit } from "@/lib/rate-limit";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { payments } from "@/db/schema";
import { requireUser } from "@/lib/access";
import { AppError } from "@/lib/errors";
import { mutation, limitedBody } from "@/lib/http";
import {
  amountSchema,
  dateSchema,
  idSchema,
  todayIndia,
} from "@/lib/validation";
import { expireProviderAttempts, lockFee, feeBalance } from "@/lib/ledger";
import { storage, uploadScreenshot, validateImage } from "@/lib/storage";
import { notifyManualPaymentSubmitted } from "@/lib/notifications";
export const runtime = "nodejs";
export const maxDuration = 60;
export const POST = mutation(async (req) => {
  const user = await requireUser();
  await rateLimit(user.id, "payments/manual", 5);
  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.startsWith("multipart/form-data"))
    throw new AppError("Choose a screenshot.");
  const raw = await limitedBody(req, 3 * 1024 * 1024 + 16384);
  const form = await new Response(raw, {
    headers: { "Content-Type": contentType },
  }).formData();
  const values = z
    .object({
      feeDueId: idSchema,
      amount: amountSchema,
      paymentDate: dateSchema.refine(
        (d) => d <= todayIndia(),
        "Payment date cannot be in the future.",
      ),
    })
    .parse(Object.fromEntries(form));
  const file = form.get("screenshot");
  if (!(file instanceof File))
    throw new AppError("Choose your payment screenshot.");
  const bytes = Buffer.from(await file.arrayBuffer());
  validateImage(bytes, file.type);
  // Reserve under a fee lock before uploading; parallel requests cannot upload twice.
  const id = crypto.randomUUID();
  const publicId = `hostel-payments/${id}`;
  await getDb().transaction(async (tx) => {
    const fee = await lockFee(tx, values.feeDueId);
    if (fee.userId !== user.id) throw new AppError("Fee not found.", 404);
    await expireProviderAttempts(user.id, tx, fee.id);
    const [pending] = await tx
      .select()
      .from(payments)
      .where(
        and(eq(payments.feeDueId, fee.id), eq(payments.status, "pending")),
      );
    if (pending)
      throw new AppError(
        pending.method === "manual_upi"
          ? "A screenshot is already awaiting review."
          : "An online checkout is open. Complete it or ask the office to check it.",
        409,
      );
    const outstanding = await feeBalance(tx, fee);
    if (values.amount > outstanding)
      throw new AppError("Amount is more than your remaining fee.");
    await tx.insert(payments).values({
      id,
      feeDueId: fee.id,
      userId: user.id,
      amount: values.amount,
      method: "manual_upi",
      paymentDate: values.paymentDate,
    });
  });
  try {
    await uploadScreenshot(bytes, publicId);
    const saved = await getDb()
      .update(payments)
      .set({ screenshotPublicId: publicId })
      .where(and(eq(payments.id, id), eq(payments.status, "pending")))
      .returning({ id: payments.id });
    if (!saved.length)
      throw new AppError(
        "The office has already reviewed this submission. Check your payment history.",
        409,
      );
  } catch (error) {
    await getDb()
      .update(payments)
      .set({
        status: "failed",
        reviewNote: "Screenshot upload did not complete. Please submit again.",
      })
      .where(and(eq(payments.id, id), eq(payments.status, "pending")));
    await storage()
      .uploader.destroy(publicId, { type: "authenticated" })
      .catch(() => undefined);
    throw error;
  }
  // Notify student + admins (non-blocking)
  try {
    await notifyManualPaymentSubmitted(id);
  } catch (err) {
    console.error("[Notification] notifyManualPaymentSubmitted failed:", err);
  }
  return Response.json({ id, status: "pending" });
});

