-- Recreate the enum so its new value can be used in this migration transaction.
ALTER TABLE "users" ALTER COLUMN "approval_status" DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "approval_status" TYPE text USING "approval_status"::text;
--> statement-breakpoint
DROP TYPE "public"."approval_status";
--> statement-breakpoint
CREATE TYPE "public"."approval_status" AS ENUM ('onboarding_incomplete', 'pending', 'accepted', 'rejected');
--> statement-breakpoint
UPDATE "users" SET "approval_status" = 'onboarding_incomplete'
WHERE "role" = 'student' AND "approval_status" = 'pending'
AND NOT EXISTS (SELECT 1 FROM "student_profiles" WHERE "user_id" = "users"."id");
--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "approval_status" TYPE "public"."approval_status" USING "approval_status"::"public"."approval_status";
--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "approval_status" SET DEFAULT 'onboarding_incomplete';
--> statement-breakpoint
ALTER TABLE "student_profiles" ALTER COLUMN "course" TYPE text USING "course"::text;
--> statement-breakpoint
DROP TYPE "public"."course";
