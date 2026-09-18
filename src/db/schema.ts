import {
  jsonb,
  pgTable,
  text,
  timestamp,
  boolean,
  integer,
  bigint,
  pgEnum,
  index,
  uniqueIndex,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
export const roleEnum = pgEnum("role", ["student", "admin"]);
export const approvalEnum = pgEnum("approval_status", [
  "onboarding_incomplete",
  "pending",
  "accepted",
  "rejected",
]);
export const methodEnum = pgEnum("payment_method", [
  "cashfree",
  "manual_upi",
  "admin_manual",
]);
export const statusEnum = pgEnum("payment_status", [
  "pending",
  "verified",
  "rejected",
  "failed",
]);
const created = () =>
  timestamp("created_at", { withTimezone: true }).defaultNow().notNull();
export const users = pgTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").default(false).notNull(),
  image: text("image"),
  role: roleEnum("role").default("student").notNull(),
  approvalStatus: approvalEnum("approval_status").default("onboarding_incomplete").notNull(),
  monthlyRent: integer("monthly_rent").default(100_000).notNull(),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  approvalRevision: integer("approval_revision").default(0).notNull(),
  approvalAudit: jsonb("approval_audit")
    .$type<{ actor: string; decision: string; at: string }[]>()
    .default([])
    .notNull(),
  createdAt: created(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});
export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    token: text("token").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: created(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);
export const accounts = pgTable(
  "accounts",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", {
      withTimezone: true,
    }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", {
      withTimezone: true,
    }),
    scope: text("scope"),
    password: text("password"),
    createdAt: created(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index("accounts_user_idx").on(t.userId),
    uniqueIndex("account_provider_unique").on(t.providerId, t.accountId),
  ],
);
export const verifications = pgTable(
  "verifications",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: created(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [index("verification_identifier_idx").on(t.identifier)],
);
export const rateLimits = pgTable("rate_limits", {
  id: text("id").primaryKey(),
  key: text("key").notNull().unique(),
  count: integer("count").notNull(),
  lastRequest: bigint("last_request", { mode: "number" }).notNull(),
});
export const studentProfiles = pgTable("student_profiles", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "restrict" }),
  fullName: text("full_name").notNull(),
  phone: text("phone").notNull(),
  course: text("course").notNull(),
  trade: text("trade").notNull(),
  studyYear: text("study_year").notNull(),
  createdAt: created(),
});
export const feeDues = pgTable(
  "fee_dues",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    rentMonth: text("rent_month"),
    label: text("label").notNull(),
    amount: integer("amount").notNull(),
    dueDate: text("due_date").notNull(),
    waivedAmount: integer("waived_amount").default(0).notNull(),
    adjustmentNote: text("adjustment_note"),
    adjustedBy: text("adjusted_by").references(() => users.id),
    adjustedAt: timestamp("adjusted_at", { withTimezone: true }),
    audit: jsonb("audit")
      .$type<
        {
          actor: string;
          action: string;
          note: string;
          at: string;
          amount: number;
          waivedAmount: number;
          dueDate: string;
        }[]
      >()
      .default([])
      .notNull(),
    revision: integer("revision").default(0).notNull(),
    createdAt: created(),
  },
  (t) => [
    index("fee_user_idx").on(t.userId),
    uniqueIndex("one_rent_per_student_month").on(t.userId, t.rentMonth),
    check(
      "rent_month_valid",
      sql`${t.rentMonth} is null or ${t.rentMonth} ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'`,
    ),
    check("fee_amount_positive", sql`${t.amount} > 0`),
    check(
      "waiver_valid",
      sql`${t.waivedAmount} >= 0 and ${t.waivedAmount} <= ${t.amount}`,
    ),
  ],
);
export const payments = pgTable(
  "payments",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    feeDueId: text("fee_due_id")
      .notNull()
      .references(() => feeDues.id),
    amount: integer("amount").notNull(),
    method: methodEnum("method").notNull(),
    status: statusEnum("status").default("pending").notNull(),
    attemptStatus: text("attempt_status").$type<
      | "checkout_started"
      | "pending"
      | "paid"
      | "failed"
      | "cancelled"
      | "abandoned"
    >(),
    cashfreeOrderId: text("cashfree_order_id").unique(),
    cashfreePaymentId: text("cashfree_payment_id").unique(),
    screenshotPublicId: text("screenshot_public_id").unique(),
    paymentDate: text("payment_date"),
    revision: integer("revision").default(0).notNull(),
    adminAudit: jsonb("admin_audit")
      .$type<
        {
          actor: string;
          at: string;
          note: string;
          previousAmount: number;
          previousDate: string | null;
          previousStatus: string;
          previousNote: string | null;
        }[]
      >()
      .default([])
      .notNull(),
    reviewNote: text("review_note"),
    reviewedBy: text("reviewed_by").references(() => users.id),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    createdAt: created(),
  },
  (t) => [
    index("payment_user_idx").on(t.userId),
    index("payment_due_idx").on(t.feeDueId),
    index("payment_status_idx").on(t.status),
    check("payment_amount_positive", sql`${t.amount} > 0`),
    uniqueIndex("one_pending_payment_per_fee")
      .on(t.feeDueId)
      .where(sql`${t.status} = 'pending'`),
  ],
);

export const notificationLogs = pgTable(
  "notification_logs",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    feeDueId: text("fee_due_id").references(() => feeDues.id, {
      onDelete: "cascade",
    }),
    paymentId: text("payment_id").references(() => payments.id, {
      onDelete: "cascade",
    }),
    type: text("type").notNull(),
    recipient: text("recipient").notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("notification_user_idx").on(t.userId),
    index("notification_fee_idx").on(t.feeDueId),
    index("notification_payment_idx").on(t.paymentId),
    index("notification_type_sent_idx").on(t.type, t.sentAt),
  ],
);

