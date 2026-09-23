import "server-only";
import { and, eq, gt, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import {
  feeDues,
  payments,
  users,
  studentProfiles,
  notificationLogs,
} from "@/db/schema";
import { dateLabel, money, balance } from "./money";
import { todayIndia } from "./validation";
import {
  sendEmail,
  buildRentGeneratedEmail,
  buildPaymentSuccessEmail,
  buildPaymentIncompleteEmail,
  buildOverdueReminderEmail,
} from "./email";
import { publicOrigin } from "./env";

const getBaseUrl = () => publicOrigin();

// 1. Monthly Rent Generated Notification
export async function notifyRentGenerated(feeDueId: string) {
  try {
    const db = getDb();

    // Check if notification was already sent for this fee
    const [alreadySent] = await db
      .select({ id: notificationLogs.id })
      .from(notificationLogs)
      .where(
        and(
          eq(notificationLogs.feeDueId, feeDueId),
          eq(notificationLogs.type, "rent_generated"),
        ),
      );
    if (alreadySent) return;

    const [fee] = await db
      .select()
      .from(feeDues)
      .where(eq(feeDues.id, feeDueId));
    if (!fee) return;

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, fee.userId));
    if (!user || !user.email) return;

    const [profile] = await db
      .select()
      .from(studentProfiles)
      .where(eq(studentProfiles.userId, user.id));

    // Calculate previous due and total due
    const allFees = await db
      .select()
      .from(feeDues)
      .where(eq(feeDues.userId, user.id));

    const allPayments = await db
      .select()
      .from(payments)
      .where(
        and(
          eq(payments.userId, user.id),
          eq(payments.status, "verified"),
        ),
      );

    let totalDue = 0;
    let previousDue = 0;

    for (const f of allFees) {
      const paid = allPayments
        .filter((p) => p.feeDueId === f.id)
        .reduce((sum, p) => sum + p.amount, 0);
      const out = balance(f.amount, paid, f.waivedAmount);
      totalDue += out;
      if (f.id !== fee.id) {
        previousDue += out;
      }
    }

    const emailData = buildRentGeneratedEmail({
      studentName: profile?.fullName || user.name || "Student",
      currentRentFormatted: money(fee.amount),
      previousDueFormatted: money(previousDue),
      totalDueFormatted: money(totalDue),
      dueDate: dateLabel(fee.dueDate),
      payUrl: `${getBaseUrl()}/student/pay`,
    });

    const result = await sendEmail({
      to: user.email,
      ...emailData,
    });

    if (result.success) {
      await db.insert(notificationLogs).values({
        id: crypto.randomUUID(),
        userId: user.id,
        feeDueId: fee.id,
        type: "rent_generated",
        recipient: user.email,
      });
    }
  } catch (err) {
    console.error(
      "[Notification] Failed to send rent generated email:",
      err instanceof Error ? err.name : "UnknownError",
    );
  }
}

// 2. Payment Successful Notification
export async function notifyPaymentSuccess(paymentId: string) {
  try {
    const db = getDb();

    // Check if notification was already sent for this payment
    const [alreadySent] = await db
      .select({ id: notificationLogs.id })
      .from(notificationLogs)
      .where(
        and(
          eq(notificationLogs.paymentId, paymentId),
          eq(notificationLogs.type, "payment_success"),
        ),
      );
    if (alreadySent) return;

    const [payment] = await db
      .select()
      .from(payments)
      .where(eq(payments.id, paymentId));
    if (!payment || payment.status !== "verified") return;

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, payment.userId));
    if (!user || !user.email) return;

    const [profile] = await db
      .select()
      .from(studentProfiles)
      .where(eq(studentProfiles.userId, user.id));

    const emailData = buildPaymentSuccessEmail({
      studentName: profile?.fullName || user.name || "Student",
      amountFormatted: money(payment.amount),
      paymentDate: dateLabel(payment.paymentDate || payment.createdAt),
      receiptUrl: `${getBaseUrl()}/receipts/${payment.id}`,
    });

    const result = await sendEmail({
      to: user.email,
      ...emailData,
    });

    if (result.success) {
      await db.insert(notificationLogs).values({
        id: crypto.randomUUID(),
        userId: user.id,
        feeDueId: payment.feeDueId,
        paymentId: payment.id,
        type: "payment_success",
        recipient: user.email,
      });
    }
  } catch (err) {
    console.error(
      "[Notification] Failed to send payment success email:",
      err instanceof Error ? err.name : "UnknownError",
    );
  }
}

// 3. Payment Failed or Cancelled Notification
export async function notifyPaymentIncomplete(
  paymentId: string,
  type: "failed" | "cancelled",
) {
  try {
    const db = getDb();
    const [payment] = await db
      .select()
      .from(payments)
      .where(eq(payments.id, paymentId));
    if (!payment) return;

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, payment.userId));
    if (!user || !user.email) return;

    // Check if an incomplete notice was sent in the last 15 minutes to avoid spamming
    const fifteenMinsAgo = new Date(Date.now() - 15 * 60 * 1000);
    const [recent] = await db
      .select({ id: notificationLogs.id })
      .from(notificationLogs)
      .where(
        and(
          eq(notificationLogs.userId, user.id),
          inArray(notificationLogs.type, [
            "payment_failed",
            "payment_cancelled",
          ]),
          gt(notificationLogs.sentAt, fifteenMinsAgo),
        ),
      );
    if (recent) return;

    const [profile] = await db
      .select()
      .from(studentProfiles)
      .where(eq(studentProfiles.userId, user.id));

    const emailData = buildPaymentIncompleteEmail({
      studentName: profile?.fullName || user.name || "Student",
      amountFormatted: money(payment.amount),
      type,
      payUrl: `${getBaseUrl()}/student/pay`,
    });

    const result = await sendEmail({
      to: user.email,
      ...emailData,
    });

    if (result.success) {
      await db.insert(notificationLogs).values({
        id: crypto.randomUUID(),
        userId: user.id,
        feeDueId: payment.feeDueId,
        paymentId: payment.id,
        type: type === "failed" ? "payment_failed" : "payment_cancelled",
        recipient: user.email,
      });
    }
  } catch (err) {
    console.error(
      `[Notification] Failed to send payment ${type} email:`,
      err instanceof Error ? err.name : "UnknownError",
    );
  }
}

// 4. Daily Overdue Payment Reminders (with 3-day window duplicate prevention)
export async function sendOverdueReminders(cooldownDays = 3) {
  const db = getDb();
  const today = todayIndia();
  const cooldownCutoff = new Date(
    Date.now() - cooldownDays * 24 * 60 * 60 * 1000,
  );

  // 1. Get all accepted students
  const acceptedStudents = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
    })
    .from(users)
    .where(
      and(eq(users.role, "student"), eq(users.approvalStatus, "accepted")),
    );

  let sentCount = 0;
  let skippedCount = 0;

  for (const student of acceptedStudents) {
    if (!student.email) continue;

    // Do not urge another payment while an online attempt may still settle.
    const pendingPayment = await db
      .select({ id: payments.id })
      .from(payments)
      .where(and(eq(payments.userId, student.id), eq(payments.status, "pending")));
    if (pendingPayment.length > 0) {
      // A pending Cashfree attempt needs provider verification first
      skippedCount++;
      continue;
    }

    // Get fees and verified payments
    const [fees, history] = await Promise.all([
      db
        .select()
        .from(feeDues)
        .where(eq(feeDues.userId, student.id))
        .orderBy(feeDues.dueDate),
      db
        .select()
        .from(payments)
        .where(
          and(
            eq(payments.userId, student.id),
            eq(payments.status, "verified"),
          ),
        ),
    ]);

    let totalDue = 0;
    let mostOverdueFee: (typeof fees)[0] | null = null;

    for (const f of fees) {
      const paid = history
        .filter((p) => p.feeDueId === f.id)
        .reduce((sum, p) => sum + p.amount, 0);
      const out = balance(f.amount, paid, f.waivedAmount);
      totalDue += out;

      if (out > 0 && f.dueDate <= today && !mostOverdueFee) {
        mostOverdueFee = f;
      }
    }

    if (!mostOverdueFee || totalDue === 0) continue;

    // Check if an overdue reminder was already sent within the cooldown window
    const recentReminder = await db
      .select({ id: notificationLogs.id })
      .from(notificationLogs)
      .where(
        and(
          eq(notificationLogs.userId, student.id),
          eq(notificationLogs.type, "overdue_reminder"),
          gt(notificationLogs.sentAt, cooldownCutoff),
        ),
      )
      .limit(1);

    if (recentReminder.length > 0) {
      skippedCount++;
      continue;
    }

    const [profile] = await db
      .select()
      .from(studentProfiles)
      .where(eq(studentProfiles.userId, student.id));

    const emailData = buildOverdueReminderEmail({
      studentName: profile?.fullName || student.name || "Student",
      totalDueFormatted: money(totalDue),
      dueDate: dateLabel(mostOverdueFee.dueDate),
      payUrl: `${getBaseUrl()}/student/pay`,
    });

    const result = await sendEmail({
      to: student.email,
      ...emailData,
    });

    if (result.success) {
      await db.insert(notificationLogs).values({
        id: crypto.randomUUID(),
        userId: student.id,
        feeDueId: mostOverdueFee.id,
        type: "overdue_reminder",
        recipient: student.email,
      });
      sentCount++;
    }
  }

  return { sentCount, skippedCount };
}
