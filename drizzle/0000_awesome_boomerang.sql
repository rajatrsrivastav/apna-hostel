CREATE TYPE "public"."course" AS ENUM('ITI', 'Diploma');--> statement-breakpoint
CREATE TYPE "public"."payment_method" AS ENUM('razorpay', 'manual_upi');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('student', 'admin');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('pending', 'verified', 'rejected', 'failed');--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fee_dues" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"label" text NOT NULL,
	"amount" integer NOT NULL,
	"due_date" text NOT NULL,
	"waived_amount" integer DEFAULT 0 NOT NULL,
	"adjustment_note" text,
	"adjusted_by" text,
	"adjusted_at" timestamp with time zone,
	"audit" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fee_amount_positive" CHECK ("fee_dues"."amount" > 0),
	CONSTRAINT "waiver_valid" CHECK ("fee_dues"."waived_amount" >= 0 and "fee_dues"."waived_amount" <= "fee_dues"."amount")
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"fee_due_id" text NOT NULL,
	"amount" integer NOT NULL,
	"method" "payment_method" NOT NULL,
	"status" "payment_status" DEFAULT 'pending' NOT NULL,
	"razorpay_order_id" text,
	"razorpay_payment_id" text,
	"screenshot_public_id" text,
	"payment_date" text,
	"review_note" text,
	"reviewed_by" text,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payments_razorpay_order_id_unique" UNIQUE("razorpay_order_id"),
	CONSTRAINT "payments_razorpay_payment_id_unique" UNIQUE("razorpay_payment_id"),
	CONSTRAINT "payments_screenshot_public_id_unique" UNIQUE("screenshot_public_id"),
	CONSTRAINT "payment_amount_positive" CHECK ("payments"."amount" > 0)
);
--> statement-breakpoint
CREATE TABLE "rate_limits" (
	"id" text PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"count" integer NOT NULL,
	"last_request" bigint NOT NULL,
	CONSTRAINT "rate_limits_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "sessions_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "student_profiles" (
	"user_id" text PRIMARY KEY NOT NULL,
	"full_name" text NOT NULL,
	"phone" text NOT NULL,
	"course" "course" NOT NULL,
	"trade" text NOT NULL,
	"study_year" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"role" "role" DEFAULT 'student' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verifications" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fee_dues" ADD CONSTRAINT "fee_dues_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fee_dues" ADD CONSTRAINT "fee_dues_adjusted_by_users_id_fk" FOREIGN KEY ("adjusted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_fee_due_id_fee_dues_id_fk" FOREIGN KEY ("fee_due_id") REFERENCES "public"."fee_dues"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_profiles" ADD CONSTRAINT "student_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "accounts_user_idx" ON "accounts" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "account_provider_unique" ON "accounts" USING btree ("provider_id","account_id");--> statement-breakpoint
CREATE INDEX "fee_user_idx" ON "fee_dues" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "payment_user_idx" ON "payments" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "payment_due_idx" ON "payments" USING btree ("fee_due_id");--> statement-breakpoint
CREATE INDEX "payment_status_idx" ON "payments" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "one_pending_payment_per_fee" ON "payments" USING btree ("fee_due_id") WHERE "payments"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verifications" USING btree ("identifier");