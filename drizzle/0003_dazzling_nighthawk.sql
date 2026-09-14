ALTER TABLE "payments" ADD COLUMN "attempt_status" text;
--> statement-breakpoint
UPDATE payments SET attempt_status = CASE status WHEN 'verified' THEN 'paid' WHEN 'failed' THEN 'failed' ELSE 'checkout_started' END WHERE method = 'razorpay';
