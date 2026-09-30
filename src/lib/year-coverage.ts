import "server-only";
import { and, eq, gte, inArray, isNull, lte, ne, or } from "drizzle-orm";
import { getDb } from "@/db";
import { feeDues, payments, rentCoverage, users } from "@/db/schema";
import { AppError } from "./errors";
import { feeBalance, type Transaction } from "./ledger";
import { generateMonthlyRent, indiaMonth } from "./rent";
import { academicYearStart } from "./academic-year";

async function lockStudent(tx: Transaction, userId: string) {
  const [student] = await tx
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .for("update");
  if (student?.role !== "student" || student.approvalStatus !== "accepted")
    throw new AppError("An accepted student account is required.", 403);
  return student;
}

async function assertNoOpenPayments(tx: Transaction, feeIds: string[]) {
  if (!feeIds.length) return;
  const open = await tx
    .select({ id: payments.id })
    .from(payments)
    .where(
      and(
        inArray(payments.feeDueId, feeIds),
        or(
          eq(payments.status, "pending"),
          and(
            eq(payments.method, "cashfree"),
            ne(payments.status, "verified"),
            or(
              isNull(payments.attemptStatus),
              ne(payments.attemptStatus, "abandoned"),
            ),
          ),
        ),
      ),
    );
  if (open.length)
    throw new AppError(
      "Check and resolve existing payment attempts before changing academic year coverage.",
      409,
    );
}

export async function recordYearCoverage(
  input: {
    userId: string;
    startYear: number;
    continueNextYear: boolean;
    note: string;
    feeId?: string;
    feeRevision?: number;
  },
  actor: string,
  now = new Date(),
) {
  const currentYear = academicYearStart(indiaMonth(now));
  if (input.startYear < 2026 || input.startYear > currentYear + 1)
    throw new AppError(
      "Choose an academic year from 2026 through the next academic year.",
    );
  const startMonth = `${input.startYear}-08`,
    endMonth = `${input.startYear + 1}-07`;
  return getDb().transaction(async (tx) => {
    await lockStudent(tx, input.userId);
    const existing = await tx
      .select({ id: rentCoverage.id })
      .from(rentCoverage)
      .where(
        and(
          eq(rentCoverage.userId, input.userId),
          eq(rentCoverage.startMonth, startMonth),
          isNull(rentCoverage.revokedAt),
        ),
      );
    if (existing.length)
      throw new AppError(
        "This academic year is already recorded. Manage its existing entry.",
        409,
      );
    // First materialize accrued months, then record coverage and clear only rent
    // within this year. One-off fees and earlier unpaid years remain payable.
    await generateMonthlyRent(input.userId, now, tx);
    const fees = await tx
      .select()
      .from(feeDues)
      .where(
        and(
          eq(feeDues.userId, input.userId),
          gte(feeDues.rentMonth, startMonth),
          lte(feeDues.rentMonth, endMonth),
        ),
      )
      .orderBy(feeDues.id)
      .for("update");
    if (input.feeId) {
      const fee = fees.find((f) => f.id === input.feeId);
      if (!fee || fee.revision !== input.feeRevision)
        throw new AppError(
          "This fee changed or is outside the selected year. Reload and try again.",
          409,
        );
    }
    await assertNoOpenPayments(
      tx,
      fees.map((f) => f.id),
    );
    const id = crypto.randomUUID();
    const adjustments: {
      feeId: string;
      waived: number;
      revisionAfter: number;
    }[] = [];
    for (const fee of fees) {
      const outstanding = await feeBalance(tx, fee);
      if (!outstanding) continue;
      await tx
        .update(feeDues)
        .set({
          waivedAmount: fee.waivedAmount + outstanding,
          adjustmentNote: `Academic year paid externally: ${input.note}`,
          adjustedBy: actor,
          adjustedAt: now,
          revision: fee.revision + 1,
          audit: [
            ...fee.audit,
            {
              actor,
              action: "academicYearPaid",
              note: input.note,
              at: now.toISOString(),
              amount: fee.amount,
              waivedAmount: fee.waivedAmount,
              dueDate: fee.dueDate,
            },
          ],
        })
        .where(eq(feeDues.id, fee.id));
      adjustments.push({
        feeId: fee.id,
        waived: outstanding,
        revisionAfter: fee.revision + 1,
      });
    }
    await tx.insert(rentCoverage).values({
      id,
      userId: input.userId,
      startMonth,
      endMonth,
      continueNextYear: input.continueNextYear,
      note: input.note,
      recordedBy: actor,
      recordedAt: now,
      feeAdjustments: adjustments,
      audit: [
        {
          actor,
          action: "record",
          note: input.note,
          at: now.toISOString(),
          continueNextYear: input.continueNextYear,
        },
      ],
    });
    return id;
  });
}

export async function changeYearCoverage(
  input: {
    userId: string;
    id: string;
    revision: number;
    action: "renewal" | "revoke";
    continueNextYear?: boolean;
    note: string;
  },
  actor: string,
  now = new Date(),
) {
  await getDb().transaction(async (tx) => {
    await lockStudent(tx, input.userId);
    const [coverage] = await tx
      .select()
      .from(rentCoverage)
      .where(
        and(
          eq(rentCoverage.id, input.id),
          eq(rentCoverage.userId, input.userId),
        ),
      )
      .for("update");
    if (!coverage || coverage.revokedAt || coverage.revision !== input.revision)
      throw new AppError(
        "The academic year setting changed. Reload and try again.",
        409,
      );
    if (input.action === "revoke") {
      const fees = coverage.feeAdjustments.length
        ? await tx
            .select()
            .from(feeDues)
            .where(
              inArray(
                feeDues.id,
                coverage.feeAdjustments.map((a) => a.feeId),
              ),
            )
            .orderBy(feeDues.id)
            .for("update")
        : [];
      await assertNoOpenPayments(
        tx,
        fees.map((f) => f.id),
      );
      for (const adjustment of coverage.feeAdjustments) {
        const fee = fees.find((f) => f.id === adjustment.feeId);
        if (!fee || fee.revision !== adjustment.revisionAfter)
          throw new AppError(
            "A covered fee was changed. Review its adjustments before removing year coverage.",
            409,
          );
        await tx
          .update(feeDues)
          .set({
            waivedAmount: Math.max(0, fee.waivedAmount - adjustment.waived),
            adjustmentNote: input.note,
            adjustedBy: actor,
            adjustedAt: now,
            revision: fee.revision + 1,
            audit: [
              ...fee.audit,
              {
                actor,
                action: "academicYearUndo",
                note: input.note,
                at: now.toISOString(),
                amount: fee.amount,
                waivedAmount: fee.waivedAmount,
                dueDate: fee.dueDate,
              },
            ],
          })
          .where(eq(feeDues.id, fee.id));
      }
    }
    await tx
      .update(rentCoverage)
      .set({
        ...(input.action === "revoke"
          ? { revokedAt: now }
          : { continueNextYear: input.continueNextYear! }),
        revision: coverage.revision + 1,
        audit: [
          ...coverage.audit,
          {
            actor,
            action: input.action,
            note: input.note,
            at: now.toISOString(),
            continueNextYear:
              input.continueNextYear ?? coverage.continueNextYear,
          },
        ],
      })
      .where(eq(rentCoverage.id, coverage.id));
    // Restores only accrued months on undo/resume, never future rent.
    await generateMonthlyRent(input.userId, now, tx);
  });
}
