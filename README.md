# Apna Hostel — PG / hostel fee portal

A mobile-first hostel fee portal for ITI and Diploma students. Next.js 16 App Router, TypeScript, Tailwind CSS 4, shadcn-style Radix UI components, Better Auth with Google, Drizzle, Neon PostgreSQL, Razorpay, and private Cloudinary image storage. The lockfile pins the installed stable versions. There are **no demo accounts, fabricated payments, or mock data in the application**.

## Quick local setup

Requirements: Node.js 22+, npm, and accounts with Neon, Google Cloud, Razorpay, and Cloudinary.

```sh
npm ci
cp .env.example .env.local
openssl rand -base64 32
```

Paste that generated secret into `BETTER_AUTH_SECRET`; fill the remaining `.env.local` values using the steps below. Never use the example database URL as a real connection string. No secret is exposed through `NEXT_PUBLIC_*` variables.

```sh
npm run db:migrate
npm run dev
```

Open http://localhost:3000. Sign in with Google. New students see only “Approval Pending / Admin se approval pending hai.” An admin must accept them in Pending Students before they can finish the five-field profile or access any dashboard. Acceptance creates the first ₹1,000 monthly rent.

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

### 4. Razorpay test and live configuration

1. In the [Razorpay dashboard](https://dashboard.razorpay.com/), select **Test mode**, generate API keys, and fill `RAZORPAY_KEY_ID=rzp_test_...` and `RAZORPAY_KEY_SECRET` from the same key pair.
2. Set payments to **automatic capture** in the dashboard. The portal only marks a payment verified after the server fetches `captured` status; authorization alone does not clear a fee.
3. Generate a separate random `RAZORPAY_WEBHOOK_SECRET` (for example with `openssl rand -base64 32`).
4. Create a webhook for **`https://YOUR-DOMAIN/api/razorpay/webhook`**, using the same webhook secret. Enable **`payment.captured`**, **`order.paid`**, and **`payment.failed`** events.
5. Razorpay cannot call localhost directly. For local webhook testing, expose port 3000 through an HTTPS tunnel or use a stable Vercel staging domain; configure that public URL in Razorpay. Keep browser sign-in on the origin configured in `BETTER_AUTH_URL`.
6. Test a fee using the test checkout options available in Razorpay. Verify that the receipt changes to Paid, duplicate webhook deliveries do not add money again, and manual UPI uploads stay pending until approval.
7. For live operation, complete Razorpay activation, switch the deployment to the **live key pair**, create a **live-mode webhook**, and use its secret. Test keys and live keys/webhooks are separate. Use a separate staging database to avoid mixing test and real collections. Redeploy after changing variables.

Checkout creates the amount from the database; the browser cannot choose an online payment amount. Checkout signatures use `stored_order_id|payment_id`. Webhooks authenticate the original raw bytes. Both then fetch the payment from Razorpay and share an idempotent, row-locked settlement function. Order/payment IDs have database uniqueness constraints. Repeated deliveries and delayed failure events cannot demote a verified payment.

An abandoned online order is reused when the student opens checkout again. “Check payment” reconciles with Razorpay after connection loss. A failed order can later become captured, and that actual collection is retained. A pending online checkout temporarily blocks manual submissions for the same fee to reduce duplicate payment risk. If it has not failed or completed, use the existing checkout; the office should reconcile deducted money before another payment. Do not mark captured transactions unpaid to simulate a refund: refunds are handled in Razorpay and must be reconciled operationally; automated refund processing is outside this portal’s fee-collection scope.

Reference: [Razorpay webhook validation](https://razorpay.com/docs/webhooks/validate-test/).

### 5. Cloudinary screenshots

1. Create a [Cloudinary](https://console.cloudinary.com/) product environment. Copy **Cloud name, API key, and API secret** into the three `CLOUDINARY_*` variables.
2. Keep the API secret server-only. No unsigned upload preset is used or needed.
3. The server accepts JPG, PNG, and WebP images up to **3 MB**. It verifies file signatures and uploads with delivery type **`authenticated`** under `hostel-payments/`. The server resizes large images to fit 1800 × 2400.
4. Leave these assets authenticated; do not convert the folder/assets to public delivery. The browser receives only an application URL. Each screenshot request checks the session and ownership/admin permission before proxying signed delivery from Cloudinary with `Cache-Control: private, no-store`.
5. Test by uploading a real test screenshot, viewing it as the student and admin, then checking that a logged-out request and another student cannot view it.

The body cap stays below Vercel’s function request limit. Uploads never write to a local filesystem. Failed uploads become failed payment entries and can be retried. If a function is terminated during an upload, the admin queue shows an incomplete upload; reject it with a reason so the student can retry. Periodically remove unreferenced Cloudinary assets after confirming they are not attached to a payment. Retain financial records and screenshots according to your hostel’s retention policy.

## Student workflow

- Continue with Google → Approval Pending only.
- Admin accepts → complete full name, phone, ITI/Diploma, trade, year/semester.
- Pending/rejected accounts cannot access dashboard pages, receipts, screenshots, or payment/profile APIs.
- My fee → Current Month Rent, Previous Due, Total Due, status, and **Pay Now / फीस भरें**.
- Pay online through Razorpay, or submit amount, date, and a screenshot for a manual UPI payment.
- Payments → history, status, private screenshot and a printable receipt once verified.
- Help → office call button when `HOSTEL_SUPPORT_PHONE` is set.

Rent is generated automatically at the student’s configured monthly rate (default ₹1,000) for each accepted month. Unpaid monthly dues remain on the account and sum into Previous Due; checkout lets the student select a month if more than one is due. Manual submissions allow partial payments; the outstanding balance updates only after approval.

## Admin workflow and accounting

`/admin` shows totals and an accepted-student overview. `/admin/pending` lets admins accept/reject Google accounts using the name and email supplied by Google. Rejected accounts remain available there for reconsideration. `/admin/students` searches by name/phone and filters course/status. Open a student to add a fee, update its amount/date, or inspect the full payment history. `/admin/verification` shows manual payment submissions. Check the screenshot **against your actual bank/UPI account**, then approve or reject; rejected payments include a reason visible to the student.

- All money is integer paise. Verified payments alone count as collected.
- Outstanding is the sum of `max(0, assessed fee − verified payments − admin adjustment)` per fee.
- **Record payment / Mark paid** records actual money collected by an admin as a verified `admin_manual` payment. The default amount clears that fee, or enter a partial amount. Admins can edit these collections later, with a reason, payment date and revision check. Enter 0 to void a mistaken collection; its audit history remains. Duplicate retries reuse an idempotency key.
- Razorpay and screenshot payments remain protected from collection edits. **Waive remaining fee** / **Undo waiver** are separate concession actions and never inflate money collected. Monthly rent defaults to ₹1,000 per student. The Monthly fee field changes future months; Edit fee changes an existing month while preserving payment and waiver checks.
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
3. Add a random `CRON_SECRET` for scheduled rent generation. Add the variables from `.env.example` to the **Production** environment. Use production Neon/Cloudinary credentials and the intended Razorpay mode. Set `BETTER_AUTH_URL=https://YOUR-STABLE-DOMAIN` and your secret. Do not include trailing paths.
4. Configure your stable domain. Add its exact Google callback URI and Razorpay webhook URL as described above. Avoid ephemeral preview URLs for OAuth; use a stable staging domain with its own configuration.
5. Apply `npm run db:migrate` against the production database from a trusted terminal/CI before opening the deployment. Migrations are not executed at build or on request.
6. Deploy. Sign in with the intended admin Google account, with `ADMIN_EMAIL` configured on the server.
7. Complete one test-mode online payment and one manual submission on staging, verify approval/rejection and receipts, then configure live mode for production. Check webhook deliveries in Razorpay and function logs in Vercel.
8. Configure database backups/restore in Neon and alerting for function failures and failed webhook deliveries. Place functions near the Neon database. The server uses a small pooled connection count for serverless deployment.

The application sends no-store responses for authenticated API data, checks same-origin mutation requests, validates inputs with Zod, rate limits authentication and application mutations in PostgreSQL, and uses privacy-conscious structured error logging. Unexpected API errors return a short incident reference; raw credentials and payment bodies are not logged by application code.

## Verification commands

```sh
npm run typecheck
npm run lint
npm test
npm run build
```

Tests execute the checked-in migrations in PGlite (real PostgreSQL semantics in an isolated test engine), then exercise ledger and API code with provider responses and identity mocked **only in tests**. Coverage includes real approval guards for pages/APIs, accepted-only rent, timezone boundaries, missed-month catch-up, concurrent generation, rejection/readmission, cron authentication, collection correction/voiding/idempotency, plus signatures, authorization vs capture, duplicate and out-of-order events, ownership, manual review, stale revisions, adjustments, upload validation and database uniqueness. Browser smoke checks cover the public login screen, 320px responsiveness and authenticated-route redirects. No real OAuth account, Neon database, Cloudinary account, or Razorpay credentials are bundled; successful local checks do not certify your external account configuration. Complete the staging checklist above before collecting live fees.

## Useful paths

- `src/db/schema.ts`, `drizzle/`: database schema and migrations.
- `src/lib/auth.ts`, `src/lib/access.ts`: auth/session and role enforcement.
- `src/lib/ledger.ts`: transaction-safe payment settlement.
- `src/app/api/`: authenticated mutations, screenshots and Razorpay webhook.
- `src/app/(portal)/`: student, admin, and receipt screens.
- `tests/`: isolated security and database/API tests.

## Troubleshooting

- **Google redirect mismatch:** compare the entire `/api/auth/callback/google` URI, scheme and host; restart/redeploy after changing environment variables.
- **Login configuration failure:** check the five auth/database variables and applied migrations. The public login screen can render without credentials; login itself cannot work without them.
- **Admin forbidden:** first sign in with the exact `ADMIN_EMAIL`, and confirm `ADMIN_EMAIL` is configured on the application server.
- **Payment stays pending:** check capture settings, webhook mode/secret and delivery logs, then use Check payment on the receipt.
- **Screenshot unavailable:** check the three Cloudinary variables and authenticated asset access; incomplete uploads can be rejected for retry.
- **Stale fee update:** reload before retrying; another admin or payment changed the account.

The monthly fee migration adds `users.monthly_rent` with a ₹1,000 default. Run `npm run db:migrate` before starting this version. It preserves existing dues, payments, and approval statuses. Changing the rate first generates any accrued months at the previous rate.
