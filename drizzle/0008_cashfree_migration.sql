-- Rename payment_method enum value
ALTER TYPE "public"."payment_method" RENAME VALUE 'razorpay' TO 'cashfree';
--> statement-breakpoint
-- Rename columns
ALTER TABLE "public"."payments" RENAME COLUMN "razorpay_order_id" TO "cashfree_order_id";
--> statement-breakpoint
ALTER TABLE "public"."payments" RENAME COLUMN "razorpay_payment_id" TO "cashfree_payment_id";
--> statement-breakpoint
-- Rename unique constraints
ALTER TABLE "public"."payments" RENAME CONSTRAINT "payments_razorpay_order_id_unique" TO "payments_cashfree_order_id_unique";
--> statement-breakpoint
ALTER TABLE "public"."payments" RENAME CONSTRAINT "payments_razorpay_payment_id_unique" TO "payments_cashfree_payment_id_unique";
