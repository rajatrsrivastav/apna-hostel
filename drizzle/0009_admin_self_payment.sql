ALTER TABLE "payments" ALTER COLUMN "fee_due_id" DROP NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "one_pending_admin_payment_per_user"
  ON "payments" ("user_id")
  WHERE "fee_due_id" IS NULL AND "status" = 'pending' AND "method" = 'cashfree';
