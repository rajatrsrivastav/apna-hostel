# Apna Hostel — PG / hostel fee portal

A mobile-first hostel fee portal for ITI and Diploma students. Next.js 16 App Router, TypeScript, Tailwind CSS 4, shadcn-style Radix UI components, Better Auth with Google, Drizzle, Neon PostgreSQL, and Cashfree. The lockfile pins the installed stable versions. The optional Cashfree reviewer account is isolated from real student identities. Simulated payment endpoints are removed; provider mocks exist only in tests.

## Quick local setup

Requirements: Node.js 22.x, npm, and accounts with Neon, Google Cloud, and Cashfree.

```sh
npm ci
cp .env.example .env.local
openssl rand -base64 32
```

Paste that generated secret into `BETTER_AUTH_SECRET`; fill the remaining `.env.local` values using the steps below. Production setup and release blockers are documented in [PRODUCTION.md](PRODUCTION.md). No secret is exposed through `NEXT_PUBLIC_*` variables.

```sh
npm run db:migrate
npm run dev
```

Open http://localhost:3000. Sign in with Google. New students complete onboarding, then wait for admin approval before accessing their dashboard. Acceptance generates monthly rent at the configured rate (₹1,000 by default).

### 1. Neon PostgreSQL

1. Create a project in the [Neon console](https://console.neon.tech/). Choose a region near your Vercel region.
2. Open **Connect**, select your database/role, enable connection pooling, and copy the PostgreSQL connection string.
3. Set `DATABASE_URL` to that string, preserving `sslmode=require`. This implementation uses Drizzle’s node-postgres driver; interactive transactions and row locks are required. Do not replace it with the HTTP-only driver.
4. Run `npm run db:migrate`. The checked-in SQL migrations create the complete application and Better Auth schema. Migrations are explicit, never performed on a user request.
5. For schema changes: edit `src/db/schema.ts`, run `npm run db:generate`, review and commit the SQL, then run `npm run db:migrate` against the intended database. Prefer a separate database branch for previews and tests.

### 2. Google OAuth / Better Auth

1. In [Google Cloud Console](https://console.cloud.google.com/), create/select a project. Configure **Google Auth Platform → Branding, Audience, and Data Access** (OAuth consent screen). Add your support email and app name. While the app is in testing, add each test Google account to the test users list.
2. Create an OAuth client of type **Web application**.
3. Authorized JavaScript origin: `http://localhost:3000`.
4. Authorized redirect URI: **`http://localhost:3000/api/auth/callback/google`**. The full path must match exactly.
5. Put the client ID and secret in `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`. Set `BETTER_AUTH_URL=http://localhost:3000` and a random `BETTER_AUTH_SECRET` of at least 32 characters.
6. For production, add `https://YOUR-DOMAIN` as an origin and **`https://YOUR-DOMAIN/api/auth/callback/google`** as a redirect URI. Set the production `BETTER_AUTH_URL` to the exact HTTPS origin. Complete Google’s publishing/verification requirements applicable to your consent screen.

Only Google login is enabled. Roles are not accepted from signup input. Sessions use HttpOnly cookies, secure cookies on HTTPS, a seven-day expiry, and database-backed session checks. Admin checks compare the current verified account email with server-side ADMIN_EMAIL on every request, so authorization does not depend on a cached role.

Reference: [Better Auth Next.js integration](https://better-auth.com/docs/integrations/next), [Drizzle adapter](https://better-auth.com/docs/adapters/drizzle).

### 3. Configure the admin

Set server-side `ADMIN_EMAIL` to your Google account. Sign in through the same `/login` page as students; a verified matching email automatically goes to `/admin`, without approval or seeding. Other accounts are students, even if an old database role says admin. Changing `ADMIN_EMAIL` changes authorization on the next request.

Pending/rejected students go to `/approval`, which includes Logout. Accepted students go to `/dashboard` (the existing dashboard UI); the existing profile-completion step still applies. Existing `/student` links remain supported.

### 4. Cashfree production configuration

1. Configure server-only `CASHFREE_APP_ID` and `CASHFREE_SECRET_KEY` with the existing production credentials. Set `BETTER_AUTH_URL` to the public HTTPS origin, without a path. The API and browser checkout always use production; there is no sandbox fallback or public credential variable. API version: `2026-01-01`.
2. Whitelist the production website domain in the [Cashfree dashboard](https://merchant.cashfree.com/). Set the public webhook endpoint to `https://YOUR-DOMAIN/api/cashfree/webhook` and subscribe to `PAYMENT_SUCCESS_WEBHOOK`, `PAYMENT_FAILED_WEBHOOK`, and `PAYMENT_USER_DROPPED_WEBHOOK`. Use the dashboard’s **Test Webhook** after deployment. The handler accepts signed connectivity probes and sample orders without changing rent records.
3. Orders are created server-side with amounts from the fee ledger, a durable local order ID, and a stable `x-idempotency-key`. Cashfree receives `return_url` pointing to `/student/payment-status?order_id={order_id}` and `notify_url` pointing to `/api/cashfree/webhook`. Only `payment_session_id` is passed to the production checkout SDK. An interrupted create request can safely reuse the same reservation; active orders are reused until Cashfree confirms closure.
4. Signatures use base64 HMAC-SHA256 over the timestamp header followed by the exact request bytes, using `CASHFREE_SECRET_KEY`. JSON is parsed only after constant-time signature verification. No short timestamp expiry is imposed on Cashfree retries; replay safety comes from row locks and unique payment IDs. Valid handled, duplicate, unrelated, and probe events return 200. Provider/database failures return 503 so Cashfree retries rather than losing a payment.
5. Webhooks, return-page verification, and “Check payment” all require authoritative `PAID` order state plus a matching `SUCCESS` payment with the correct ID, INR currency, and amount before crediting rent. Pending payments are not failed merely because the browser returned or a local timer elapsed. Repeated or delayed events cannot reverse a capture or double-credit rent; excess captures are held for office refund review. The simulated `/api/payments/review-pay` route is removed, while reviewer sign-in remains unchanged.
6. Run `npm run typecheck`, `npm run lint`, `npm test`, and `npm run build` before release. Automated payment tests use mocked provider responses and an isolated in-memory database, never real charges. After deploying, run Cashfree’s signed dashboard test, then verify a real authorized payment and its receipt, including duplicate webhook delivery. Confirm the hosting platform allows anonymous POST requests to the webhook (no deployment password/challenge) and that the configured HTTPS origin matches the deployed domain. Never paste credentials or webhook signatures into logs.

References: [Hosted checkout](https://www.cashfree.com/docs/payments/online/web/redirect), [Create Order](https://www.cashfree.com/docs/api-reference/payments/latest/orders/create-order), [Webhook signatures](https://www.cashfree.com/docs/payments/online/webhooks/overview), [Idempotency](https://www.cashfree.com/docs/payments/online/webhooks/webhook-indempotency).


## Student workflow

- Continue with Google → Approval Pending only.
- Admin accepts → complete full name, phone, ITI/Diploma, trade, year/semester.
- Pending/rejected accounts cannot access dashboard pages, receipts, screenshots, or payment/profile APIs.
- My fee → Current Month Rent, Previous Due, Total Due, status, and **Pay Now / फीस भरें**.
- Pay online through Cashfree, or submit amount, date, and a screenshot for a manual UPI payment.
- Payments → history, status, private screenshot and a printable receipt once verified.
- Help → office call button when `HOSTEL_SUPPORT_PHONE` is set.

Rent is generated automatically at the student’s configured monthly rate (default ₹1,000) for each accepted month. Unpaid monthly dues remain on the account and sum into Previous Due; checkout lets the student select a month if more than one is due. Manual submissions allow partial payments; the outstanding balance updates only after approval.

## Admin workflow and accounting

`/admin` shows totals and an accepted-student overview. `/admin/pending` lets admins accept/reject Google accounts using the name and email supplied by Google. Rejected accounts remain available there for reconsideration. `/admin/students` searches by name/phone and filters course/status. Open a student to add a fee, update its amount/date, or inspect the full payment history. `/admin/verification` shows manual payment submissions. Check the screenshot **against your actual bank/UPI account**, then approve or reject; rejected payments include a reason visible to the student.

- All money is integer paise. Verified payments alone count as collected.
- Outstanding is the sum of `max(0, assessed fee − verified payments − admin adjustment)` per fee.
- **Record payment / Mark paid** records actual money collected by an admin as a verified `admin_manual` payment. The default amount clears that fee, or enter a partial amount. Admins can edit these collections later, with a reason, payment date and revision check. Enter 0 to void a mistaken collection; its audit history remains. Duplicate retries reuse an idempotency key.
- Cashfree and screenshot payments remain protected from collection edits. **Waive remaining fee** / **Undo waiver** are separate concession actions and never inflate money collected. Monthly rent defaults to ₹1,000 per student. The Monthly fee field changes future months; Edit fee changes an existing month while preserving payment and waiver checks.
- Fee changes keep the previous values, reason, actor, and timestamp in the fee audit trail. Manual review stores the reviewer, time, and reason.
- Pending payments block fee changes. Row locks serialize settlement, reviews, and fee edits; a unique partial index allows only one pending payment per fee. Fee revision checks reject stale edits.
- A captured payment arriving after another settlement/adjustment is still recorded as money received. Resolve any excess with the student; do not discard provider events. Collections may exceed assessed fees in such an exceptional case.
- Accepted accounts automatically get their acceptance-month rent, even before profile completion. Admin financial overview lists accepted students; historical records for rejected accounts remain accessible to admins through Pending Students → student details.

## Approval and monthly-rent upgrade

For the earlier admission migration (0001), apply migrations with `npm run db:migrate` **before deploying the updated application**. Existing fees and payments are preserved. Existing student accounts are also set to pending by this migration: review and accept them manually; admins retain access based on role. The migration does not assume an old manually named fee represents a monthly rent. Review legacy balances/waivers before acceptance if rent was already assigned for the same period.

- Admission state is separate from role: `pending`, `accepted`, `rejected`. Signup cannot set it. Checks query the database on every protected request; rejecting a previously accepted account immediately blocks subsequent requests without waiting for its session to expire. Provider webhooks still settle real captured payments after access is revoked.
- A full monthly fee (default ₹1,000) is due for the month of acceptance, without prorating; no rent is generated for months before acceptance. Dates use **Asia/Kolkata**, and each rent is due on the last day of its month.
- The `(user_id, rent_month)` unique index plus `ON CONFLICT DO NOTHING` makes acceptance, repeated cron runs, dashboard loads and concurrent retries idempotent.
- A daily Vercel cron at `00:00 UTC` calls `/api/cron/rent`. Set a random **`CRON_SECRET`** in Vercel. Requests must supply `Authorization: Bearer <CRON_SECRET>`; there is no unauthenticated generation endpoint. See [Vercel cron authentication](https://vercel.com/docs/cron-jobs/manage-cron-jobs).
- Dashboard reads and student-detail reads also catch up missed months. No monthly maintenance or student login is required for scheduled generation. Locally, Vercel cron does not run; loading a dashboard performs catch-up, or call the cron endpoint with its authorization header.
- January unpaid ₹1,000 + February ₹1,000 + March ₹1,000 = ₹3,000. A ₹600 admin collection against January leaves Previous Due ₹1,400 and Total Due ₹2,400 in March.
- Rejecting an accepted student ends that acceptance interval after generating any missing dues through the rejection month. Readmission starts a new interval in the readmission month, without billing months spent rejected. Existing monthly rows are never duplicated and old debt is not deleted.
- Approval decisions and admin collection corrections retain actor, timestamp and previous values. Admin pages and all admin mutations require the admin role. Students have no admin navigation.

## Deploy to Vercel

1. Push this project and `package-lock.json` to your Git repository. Import it in [Vercel](https://vercel.com/new) using the **Next.js** preset.
2. Use Node.js **22.x** or a supported newer LTS release. Install command: `npm ci`; build command: `npm run build`. Keep the default Next.js output settings.
3. Add a random `CRON_SECRET` for scheduled rent generation. Add the variables from `.env.example` to the **Production** environment. Use production Neon credentials and Cashfree production credentials. Set `BETTER_AUTH_URL=https://YOUR-STABLE-DOMAIN` and your secret. Do not include trailing paths.
4. Configure your stable domain. Add its exact Google callback URI and Cashfree webhook URL as described above. Avoid ephemeral preview URLs for OAuth; use a stable staging domain with its own configuration.
5. Apply `npm run db:migrate` against the production database from a trusted terminal/CI before opening the deployment. Migrations are not executed at build or on request.
6. Deploy. Sign in with the intended admin Google account, with `ADMIN_EMAIL` configured on the server.
7. Complete one test-mode online payment and verify approval and receipts, then configure live mode for production. Check webhook deliveries in Cashfree and function logs in Vercel.
8. Configure database backups/restore in Neon and alerting for function failures and failed webhook deliveries. Place functions near the Neon database. The server uses a small pooled connection count for serverless deployment.

The application sends no-store responses for authenticated API data, checks same-origin mutation requests, validates inputs with Zod, rate limits authentication and application mutations in PostgreSQL, and uses privacy-conscious structured error logging. Unexpected API errors return a short incident reference; raw credentials and payment bodies are not logged by application code.

## Verification commands

```sh
npm run typecheck
npm run lint
npm test
npm run build
```

Tests execute the checked-in migrations in PGlite (real PostgreSQL semantics in an isolated test engine), then exercise ledger and API code with provider responses and identity mocked **only in tests**. Coverage includes Better Auth sessions and roles, reviewer record preservation, migrations, production-origin validation, email failures and HTML escaping, Cashfree signatures, duplicate and out-of-order events, payment ownership, amount mismatches, checkout retries and expiry. Browser smoke checks cover the public login screen, 320px responsiveness and authenticated-route redirects. No real OAuth account, Neon database, or Cashfree credentials are bundled; successful local checks do not certify your external account configuration. Complete the staging checklist above before collecting live fees.

## Useful paths

- `src/db/schema.ts`, `drizzle/`: database schema and migrations.
- `src/lib/auth.ts`, `src/lib/access.ts`: auth/session and role enforcement.
- `src/lib/ledger.ts`: transaction-safe payment settlement.
- `src/app/api/`: authenticated mutations and Cashfree webhook.
- `src/app/(portal)/`: student, admin, and receipt screens.
- `tests/`: isolated security and database/API tests.

## Troubleshooting

- **Google redirect mismatch:** compare the entire `/api/auth/callback/google` URI, scheme and host; restart/redeploy after changing environment variables.
- **Login configuration failure:** check the five auth/database variables and applied migrations. The login route is dynamic and requires valid runtime auth configuration. Static legal pages do not need login.
- **Admin forbidden:** first sign in with the exact `ADMIN_EMAIL`, and confirm `ADMIN_EMAIL` is configured on the application server.
- **Payment stays pending:** check production credentials, webhook signatures and delivery logs, then use Check payment on the receipt.
- **Stale fee update:** reload before retrying; another admin or payment changed the account.

The monthly fee migration adds `users.monthly_rent` with a ₹1,000 default. Run `npm run db:migrate` before starting this version. It preserves existing dues, payments, and approval statuses. Changing the rate first generates any accrued months at the previous rate.


### Payment attempt recovery and admin allowlist

Run `npm run db:migrate` before deploying this version. Migration 0003 adds
`payments.attempt_status` and backfills existing online payment rows. The existing
`status` remains the accounting/manual-review status; `attempt_status` tracks
checkout_started, pending, paid, failed, cancelled and abandoned separately.
Cashfree orders expire after 30 minutes. Active provider orders are reused; a new
checkout is allowed only after provider-confirmed closure. Local timers and browser
cancellation never establish whether money moved;
the open payment page refreshes every 15 seconds and on window focus.
Signed webhooks and server capture verification can reconcile late captures.
Captured payments that exceed the remaining fee are recorded as paid attempts
with an office refund-review note, without applying a duplicate rent credit.
The application does not automatically refund these captures.

Set `ADMIN_EMAILS` to comma-separated verified Google email addresses. Entries
are trimmed and matched case-insensitively; malformed entries are ignored.
When `ADMIN_EMAILS` is unset, `ADMIN_EMAIL` remains supported. An explicitly
empty `ADMIN_EMAILS` disables the allowlist. Current sessions re-evaluate the
allowlist on protected requests, so removal also revokes admin access.

### Onboarding status and custom courses

Apply `npm run db:migrate` before deploying this update. Migration 0006 changes
student courses to text and adds `onboarding_incomplete` as the default approval
status. Existing pending students without profiles move to that status; submitted
profiles and accepted/rejected decisions are preserved. Submitting the onboarding form sets the student to pending. The pending list requires both a
submitted profile and pending status. The current form collects name, phone, course, year, and branch/trade.
