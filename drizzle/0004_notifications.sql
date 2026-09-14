CREATE TABLE "notification_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"fee_due_id" text,
	"type" text NOT NULL,
	"recipient" text NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "notification_logs" ADD CONSTRAINT "notification_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_logs" ADD CONSTRAINT "notification_logs_fee_due_id_fee_dues_id_fk" FOREIGN KEY ("fee_due_id") REFERENCES "public"."fee_dues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "notification_user_idx" ON "notification_logs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "notification_fee_idx" ON "notification_logs" USING btree ("fee_due_id");--> statement-breakpoint
CREATE INDEX "notification_type_sent_idx" ON "notification_logs" USING btree ("type","sent_at");
