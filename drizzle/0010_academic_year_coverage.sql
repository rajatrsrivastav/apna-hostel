CREATE TABLE "rent_coverage" (
 "id" text PRIMARY KEY NOT NULL,
 "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
 "start_month" text NOT NULL,
 "end_month" text NOT NULL,
 "continue_next_year" boolean NOT NULL,
 "note" text NOT NULL,
 "recorded_by" text NOT NULL REFERENCES "users"("id"),
 "recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
 "revoked_at" timestamp with time zone,
 "revision" integer DEFAULT 0 NOT NULL,
 "fee_adjustments" jsonb DEFAULT '[]'::jsonb NOT NULL,
 "audit" jsonb DEFAULT '[]'::jsonb NOT NULL,
 CONSTRAINT "academic_year_range" CHECK (start_month ~ '^[0-9]{4}-08$' AND end_month ~ '^[0-9]{4}-07$' AND left(end_month,4)::int = left(start_month,4)::int + 1)
);
--> statement-breakpoint
CREATE INDEX "rent_coverage_user_idx" ON "rent_coverage" ("user_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "one_active_year_coverage" ON "rent_coverage" ("user_id", "start_month") WHERE revoked_at IS NULL;
