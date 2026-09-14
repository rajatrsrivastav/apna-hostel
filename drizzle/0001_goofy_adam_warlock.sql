CREATE TYPE "public"."approval_status" AS ENUM('pending', 'accepted', 'rejected');--> statement-breakpoint
ALTER TYPE "public"."payment_method" ADD VALUE 'admin_manual';--> statement-breakpoint
ALTER TABLE "fee_dues" ADD COLUMN "rent_month" text;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "revision" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "admin_audit" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "approval_status" "approval_status" DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "accepted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "approval_revision" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "approval_audit" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "one_rent_per_student_month" ON "fee_dues" USING btree ("user_id","rent_month");--> statement-breakpoint
ALTER TABLE "fee_dues" ADD CONSTRAINT "rent_month_valid" CHECK ("fee_dues"."rent_month" is null or "fee_dues"."rent_month" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$');