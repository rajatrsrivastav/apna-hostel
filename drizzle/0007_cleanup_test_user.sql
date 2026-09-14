-- Remove test user: rajatrsrivastav810@gmail.com
-- Delete in dependency order to avoid FK violations.

DELETE FROM "notification_logs" WHERE "user_id" IN (SELECT "id" FROM "users" WHERE "email" = 'rajatrsrivastav810@gmail.com');
--> statement-breakpoint
DELETE FROM "payments" WHERE "user_id" IN (SELECT "id" FROM "users" WHERE "email" = 'rajatrsrivastav810@gmail.com');
--> statement-breakpoint
DELETE FROM "fee_dues" WHERE "user_id" IN (SELECT "id" FROM "users" WHERE "email" = 'rajatrsrivastav810@gmail.com');
--> statement-breakpoint
DELETE FROM "student_profiles" WHERE "user_id" IN (SELECT "id" FROM "users" WHERE "email" = 'rajatrsrivastav810@gmail.com');
--> statement-breakpoint
DELETE FROM "sessions" WHERE "user_id" IN (SELECT "id" FROM "users" WHERE "email" = 'rajatrsrivastav810@gmail.com');
--> statement-breakpoint
DELETE FROM "accounts" WHERE "user_id" IN (SELECT "id" FROM "users" WHERE "email" = 'rajatrsrivastav810@gmail.com');
--> statement-breakpoint
DELETE FROM "users" WHERE "email" = 'rajatrsrivastav810@gmail.com';
