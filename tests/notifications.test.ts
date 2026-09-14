import {
  beforeAll,
  beforeEach,
  afterAll,
  describe,
  it,
  expect,
  vi,
} from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as schema from "@/db/schema";

const shared = vi.hoisted(() => ({
  db: undefined as unknown,
  sentEmails: [] as {
    to: string;
    subject: string;
    html: string;
    text: string;
  }[],
  simulateSendError: false,
}));

vi.mock("@/db", () => ({ getDb: () => shared.db }));

// Mock Resend sendEmail directly in @/lib/email
vi.mock("@/lib/email", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/email")>();
  return {
    ...actual,
    sendEmail: vi.fn(async (payload) => {
      if (shared.simulateSendError) {
        throw new Error("Resend service unreachable (500)");
      }
      shared.sentEmails.push(payload);
      return { id: `mock-${Date.now()}`, success: true };
    }),
  };
});

import {
  notifyRentGenerated,
  notifyPaymentSuccess,
  notifyPaymentIncomplete,
  sendOverdueReminders,
} from "@/lib/notifications";
import { GET as remindersCron } from "@/app/api/cron/reminders/route";

let client: PGlite;
let db: ReturnType<typeof drizzle<typeof schema>>;

beforeAll(async () => {
  client = new PGlite();
  db = drizzle(client, { schema });
  shared.db = db;
  await migrate(db, { migrationsFolder: "./drizzle" });
});

afterAll(async () => {
  await client.close();
});

beforeEach(async () => {
  shared.sentEmails = [];
  shared.simulateSendError = false;
  process.env.BETTER_AUTH_URL = "https://hostel.example";
  process.env.CRON_SECRET = "super-secret-cron-token";

  await client.exec(
    "TRUNCATE notification_logs, payments, fee_dues, student_profiles, users CASCADE",
  );

  // Seed sample accepted student
  await db.insert(schema.users).values([
    {
      id: "student-1",
      name: "Rohan Sharma",
      email: "rohan@example.com",
      role: "student",
      approvalStatus: "accepted",
      monthlyRent: 100_000,
    },
    {
      id: "student-2",
      name: "Amit Patel",
      email: "amit@example.com",
      role: "student",
      approvalStatus: "accepted",
      monthlyRent: 100_000,
    },
  ]);

  await db.insert(schema.studentProfiles).values([
    {
      userId: "student-1",
      fullName: "Rohan Sharma",
      phone: "9876543210",
      course: "ITI",
      trade: "Electrician",
      studyYear: "Year 1",
    },
    {
      userId: "student-2",
      fullName: "Amit Patel",
      phone: "9876543211",
      course: "Diploma",
      trade: "Mechanical",
      studyYear: "Year 2",
    },
  ]);
});

describe("Transactional Email Notifications", () => {
  describe("1. Monthly Rent Generated Notification", () => {
    it("sends rent email with current rent, previous due, and total due", async () => {
      // Create previous unpaid fee of ₹1,000
      await db.insert(schema.feeDues).values({
        id: "fee-prev",
        userId: "student-1",
        label: "Rent - Jan 2026",
        amount: 100_000, // ₹1,000
        dueDate: "2026-01-05",
      });

      // Create new monthly fee of ₹1,000
      await db.insert(schema.feeDues).values({
        id: "fee-new",
        userId: "student-1",
        label: "Rent - Feb 2026",
        amount: 100_000, // ₹1,000
        dueDate: "2026-02-05",
      });

      await notifyRentGenerated("fee-new");

      expect(shared.sentEmails).toHaveLength(1);
      const email = shared.sentEmails[0];
      expect(email.to).toBe("rohan@example.com");
      expect(email.subject).toContain("Rent of ₹1,000 Generated");
      expect(email.text).toContain("₹1,000"); // current rent
      expect(email.text).toContain("Previous Due: ₹1,000");
      expect(email.text).toContain("Total Due: ₹2,000");
      expect(email.text).toContain("/student/pay");

      // Verify notification log is created
      const logs = await db.select().from(schema.notificationLogs);
      expect(logs).toHaveLength(1);
      expect(logs[0].type).toBe("rent_generated");
      expect(logs[0].feeDueId).toBe("fee-new");
    });

    it("prevents sending duplicate emails for the same fee due", async () => {
      await db.insert(schema.feeDues).values({
        id: "fee-single",
        userId: "student-1",
        label: "Rent - Feb 2026",
        amount: 100_000,
        dueDate: "2026-02-05",
      });

      await notifyRentGenerated("fee-single");
      await notifyRentGenerated("fee-single");

      expect(shared.sentEmails).toHaveLength(1);
      const logs = await db.select().from(schema.notificationLogs);
      expect(logs).toHaveLength(1);
    });
  });

  describe("2. Payment Successful Notification", () => {
    it("sends payment success email with amount, date, and receipt link", async () => {
      await db.insert(schema.feeDues).values({
        id: "fee-1",
        userId: "student-1",
        label: "Rent - Jan 2026",
        amount: 100_000,
        dueDate: "2026-01-05",
      });

      await db.insert(schema.payments).values({
        id: "pay-1",
        userId: "student-1",
        feeDueId: "fee-1",
        amount: 100_000,
        method: "razorpay",
        status: "verified",
        attemptStatus: "paid",
        paymentDate: "2026-01-04",
      });

      await notifyPaymentSuccess("pay-1");

      expect(shared.sentEmails).toHaveLength(1);
      const email = shared.sentEmails[0];
      expect(email.to).toBe("rohan@example.com");
      expect(email.subject).toContain("Payment of ₹1,000 Confirmed");
      expect(email.text).toContain("₹1,000");
      expect(email.text).toContain("4 Jan 2026");
      expect(email.text).toContain("/receipts/pay-1");

      // Verify notification log is created with paymentId and feeDueId
      const logs = await db.select().from(schema.notificationLogs);
      expect(logs).toHaveLength(1);
      expect(logs[0].type).toBe("payment_success");
      expect(logs[0].paymentId).toBe("pay-1");
      expect(logs[0].feeDueId).toBe("fee-1");
    });

    it("does not send email if payment is still pending or failed", async () => {
      await db.insert(schema.feeDues).values({
        id: "fee-1",
        userId: "student-1",
        label: "Rent - Jan 2026",
        amount: 100_000,
        dueDate: "2026-01-05",
      });

      await db.insert(schema.payments).values({
        id: "pay-pending",
        userId: "student-1",
        feeDueId: "fee-1",
        amount: 100_000,
        method: "razorpay",
        status: "pending",
        attemptStatus: "checkout_started",
      });

      await notifyPaymentSuccess("pay-pending");
      expect(shared.sentEmails).toHaveLength(0);
    });

    it("prevents sending duplicate success emails for the same payment", async () => {
      await db.insert(schema.feeDues).values({
        id: "fee-1",
        userId: "student-1",
        label: "Rent - Jan 2026",
        amount: 100_000,
        dueDate: "2026-01-05",
      });

      await db.insert(schema.payments).values({
        id: "pay-dup",
        userId: "student-1",
        feeDueId: "fee-1",
        amount: 100_000,
        method: "razorpay",
        status: "verified",
        attemptStatus: "paid",
      });

      await notifyPaymentSuccess("pay-dup");
      await notifyPaymentSuccess("pay-dup");

      expect(shared.sentEmails).toHaveLength(1);
    });
  });

  describe("3. Payment Failed / Cancelled Notification", () => {
    it("sends failure notification with retry link", async () => {
      await db.insert(schema.feeDues).values({
        id: "fee-1",
        userId: "student-1",
        label: "Rent - Jan 2026",
        amount: 100_000,
        dueDate: "2026-01-05",
      });

      await db.insert(schema.payments).values({
        id: "pay-fail",
        userId: "student-1",
        feeDueId: "fee-1",
        amount: 100_000,
        method: "razorpay",
        status: "failed",
        attemptStatus: "failed",
      });

      await notifyPaymentIncomplete("pay-fail", "failed");

      expect(shared.sentEmails).toHaveLength(1);
      const email = shared.sentEmails[0];
      expect(email.to).toBe("rohan@example.com");
      expect(email.subject).toContain("Payment Failed");
      expect(email.text.toLowerCase()).toContain("retry");
      expect(email.text).toContain("/student/pay");
    });

    it("sends cancellation notification and prevents rapid duplicate spam", async () => {
      await db.insert(schema.feeDues).values({
        id: "fee-1",
        userId: "student-1",
        label: "Rent - Jan 2026",
        amount: 100_000,
        dueDate: "2026-01-05",
      });

      await db.insert(schema.payments).values({
        id: "pay-cancel",
        userId: "student-1",
        feeDueId: "fee-1",
        amount: 100_000,
        method: "razorpay",
        status: "failed",
        attemptStatus: "cancelled",
      });

      await notifyPaymentIncomplete("pay-cancel", "cancelled");
      expect(shared.sentEmails).toHaveLength(1);
      expect(shared.sentEmails[0].subject).toContain("Payment Cancelled");

      // Immediate second cancel notification is suppressed by 15-minute cooldown
      await notifyPaymentIncomplete("pay-cancel", "cancelled");
      expect(shared.sentEmails).toHaveLength(1);
    });
  });

  describe("4. Payment Overdue Reminders & Duplicate Prevention", () => {
    it("sends reminder only to unpaid students with overdue dues", async () => {
      // Rohan has an overdue fee (due in the past)
      await db.insert(schema.feeDues).values({
        id: "fee-overdue",
        userId: "student-1",
        label: "Rent - Past Month",
        amount: 100_000,
        dueDate: "2020-01-01",
      });

      // Amit has a fee due in the future
      await db.insert(schema.feeDues).values({
        id: "fee-future",
        userId: "student-2",
        label: "Rent - Future Month",
        amount: 100_000,
        dueDate: "2099-01-01",
      });

      const { sentCount, skippedCount } = await sendOverdueReminders(3);

      expect(sentCount).toBe(1);
      expect(skippedCount).toBe(0);
      expect(shared.sentEmails).toHaveLength(1);
      expect(shared.sentEmails[0].to).toBe("rohan@example.com");
      expect(shared.sentEmails[0].subject).toContain("Overdue Reminder");
    });

    it("skips student if they have an unverified manual UPI screenshot awaiting review", async () => {
      await db.insert(schema.feeDues).values({
        id: "fee-overdue-1",
        userId: "student-1",
        label: "Rent - Past Month",
        amount: 100_000,
        dueDate: "2020-01-01",
      });

      // Student submitted manual UPI screenshot pending admin verification
      await db.insert(schema.payments).values({
        id: "pay-pending-upi",
        userId: "student-1",
        feeDueId: "fee-overdue-1",
        amount: 100_000,
        method: "manual_upi",
        status: "pending",
        screenshotPublicId: "cloudinary-screen-1",
      });

      const { sentCount, skippedCount } = await sendOverdueReminders(3);

      expect(sentCount).toBe(0);
      expect(skippedCount).toBe(1);
      expect(shared.sentEmails).toHaveLength(0);
    });

    it("prevents sending duplicate overdue reminders within the 3-day window", async () => {
      await db.insert(schema.feeDues).values({
        id: "fee-overdue-2",
        userId: "student-1",
        label: "Rent - Past Month",
        amount: 100_000,
        dueDate: "2020-01-01",
      });

      // First run: sends reminder
      const firstRun = await sendOverdueReminders(3);
      expect(firstRun.sentCount).toBe(1);
      expect(shared.sentEmails).toHaveLength(1);

      // Second run on the next day/scheduled run: skipped by duplicate window check
      const secondRun = await sendOverdueReminders(3);
      expect(secondRun.sentCount).toBe(0);
      expect(secondRun.skippedCount).toBe(1);
      expect(shared.sentEmails).toHaveLength(1);
    });
  });

  describe("5. Vercel Cron Endpoint Protection (/api/cron/reminders)", () => {
    it("blocks unauthorized calls without Bearer CRON_SECRET", async () => {
      const res = await remindersCron(
        new Request("https://hostel.example/api/cron/reminders"),
      );
      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.error).toBe("Unauthorized");
    });

    it("executes successfully with valid Bearer CRON_SECRET", async () => {
      await db.insert(schema.feeDues).values({
        id: "fee-cron",
        userId: "student-1",
        label: "Rent - Overdue",
        amount: 100_000,
        dueDate: "2020-01-01",
      });

      const res = await remindersCron(
        new Request("https://hostel.example/api/cron/reminders", {
          headers: {
            Authorization: `Bearer super-secret-cron-token`,
          },
        }),
      );

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.ok).toBe(true);
      expect(data.sentCount).toBe(1);
      expect(shared.sentEmails).toHaveLength(1);
    });
  });

  describe("6. Email Failure Resilience", () => {
    it("never throws or blocks when Resend API fails", async () => {
      shared.simulateSendError = true;

      await db.insert(schema.feeDues).values({
        id: "fee-fail-test",
        userId: "student-1",
        label: "Rent - Feb 2026",
        amount: 100_000,
        dueDate: "2026-02-05",
      });

      await db.insert(schema.payments).values({
        id: "pay-fail-test",
        userId: "student-1",
        feeDueId: "fee-fail-test",
        amount: 100_000,
        method: "razorpay",
        status: "verified",
        attemptStatus: "paid",
      });

      // Must complete safely without throwing
      await expect(notifyRentGenerated("fee-fail-test")).resolves.not.toThrow();
      await expect(
        notifyPaymentSuccess("pay-fail-test"),
      ).resolves.not.toThrow();
      await expect(
        notifyPaymentIncomplete("pay-fail-test", "failed"),
      ).resolves.not.toThrow();
    });
  });
});
