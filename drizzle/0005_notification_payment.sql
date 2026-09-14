ALTER TABLE "notification_logs" ADD COLUMN "payment_id" text;--> statement-breakpoint
ALTER TABLE "notification_logs" ADD CONSTRAINT "notification_logs_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "notification_payment_idx" ON "notification_logs" USING btree ("payment_id");
