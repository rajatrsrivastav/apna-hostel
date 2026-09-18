import { mutation, jsonBody } from "@/lib/http";
import { requireUser } from "@/lib/access";
import { getDb } from "@/db";
import { payments } from "@/db/schema";
import { AppError } from "@/lib/errors";
import { idSchema, todayIndia } from "@/lib/validation";
import { z } from "zod";
import { feeBalance, lockFee } from "@/lib/ledger";
import { reviewLoginEnabled } from "@/lib/env";

export const POST = mutation(async (req) => {
  const user = await requireUser();
  if (!reviewLoginEnabled()) {
    throw new AppError("Cashfree review mode is not active.", 403);
  }
  const { feeDueId } = z
    .object({ feeDueId: idSchema })
    .parse(await jsonBody(req));

  const payment = await getDb().transaction(async (tx) => {
    const fee = await lockFee(tx, feeDueId);
    if (fee.userId !== user.id) throw new AppError("Fee not found.", 404);
    const amount = await feeBalance(tx, fee);
    if (amount === 0) throw new AppError("This fee is already paid.");

    const id = crypto.randomUUID();
    const [record] = await tx
      .insert(payments)
      .values({
        id,
        userId: user.id,
        feeDueId: fee.id,
        amount,
        method: "razorpay",
        status: "verified",
        attemptStatus: "paid",
        paymentDate: todayIndia(),
        reviewNote: "Simulated payment for Cashfree review verification",
      })
      .returning();
    return record;
  });

  return Response.json({ id: payment.id, status: payment.status });
});
