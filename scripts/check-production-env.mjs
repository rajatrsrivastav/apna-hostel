import { config } from "dotenv";

if (
  process.argv.includes("--if-vercel-production") &&
  process.env.VERCEL_ENV !== "production"
) {
  process.exit(0);
}
config({ path: [".env.local", ".env"], quiet: true });
const required = [
  "DATABASE_URL",
  "BETTER_AUTH_SECRET",
  "BETTER_AUTH_URL",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "CASHFREE_APP_ID",
  "CASHFREE_SECRET_KEY",
  "CLOUDINARY_CLOUD_NAME",
  "CLOUDINARY_API_KEY",
  "CLOUDINARY_API_SECRET",
  "RESEND_API_KEY",
  "RESEND_FROM_EMAIL",
  "CRON_SECRET",
];
const errors = required
  .filter((key) => !process.env[key]?.trim())
  .map((key) => `${key} is required`);
for (const key of ["BETTER_AUTH_SECRET", "CRON_SECRET"]) {
  if ((process.env[key]?.length ?? 0) < 32)
    errors.push(`${key} must contain at least 32 characters`);
}
try {
  const url = new URL(process.env.BETTER_AUTH_URL);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash ||
    /^(localhost|127(?:\.\d+){3}|\[::1\])$/.test(url.hostname) ||
    /(?:^|\.)(localhost|ngrok\.io|ngrok\.app|ngrok-free\.app|ngrok-free\.dev)$/.test(
      url.hostname,
    )
  )
    throw new Error();
} catch {
  errors.push(
    "BETTER_AUTH_URL must be the canonical public HTTPS origin, without a path or tunnel hostname",
  );
}
try {
  const db = new URL(process.env.DATABASE_URL);
  if (!["postgres:", "postgresql:"].includes(db.protocol)) throw new Error();
} catch {
  errors.push("DATABASE_URL must be a PostgreSQL connection URL");
}
const emails = (process.env.ADMIN_EMAILS ?? process.env.ADMIN_EMAIL ?? "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
if (
  !emails.length ||
  emails.some((email) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
)
  errors.push(
    "ADMIN_EMAILS (or ADMIN_EMAIL) must contain valid admin email addresses",
  );
if (
  !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(
    (process.env.RESEND_FROM_EMAIL ?? "").match(/<([^>]+)>/)?.[1] ??
      process.env.RESEND_FROM_EMAIL ??
      "",
  )
)
  errors.push("RESEND_FROM_EMAIL must contain a verified sender email");
if (process.env.ENABLE_CASHFREE_REVIEW_LOGIN === "true") {
  if (
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(process.env.CASHFREE_REVIEW_EMAIL ?? "")
  )
    errors.push(
      "CASHFREE_REVIEW_EMAIL is required when reviewer login is enabled",
    );
  if ((process.env.CASHFREE_REVIEW_PASSWORD?.length ?? 0) < 16)
    errors.push("CASHFREE_REVIEW_PASSWORD must contain at least 16 characters");
  if (
    emails.some(
      (email) =>
        email.toLowerCase() ===
        process.env.CASHFREE_REVIEW_EMAIL?.trim().toLowerCase(),
    )
  )
    errors.push("Reviewer and admin email addresses must be distinct");
}
if (errors.length) {
  console.error(
    "Production configuration is not ready:\n" +
      [...new Set(errors)].map((error) => `- ${error}`).join("\n"),
  );
  process.exitCode = 1;
} else
  console.log(
    "Production environment validation passed (values are not logged).",
  );
