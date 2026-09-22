import "server-only";
import { z } from "zod";
import { AppError } from "./errors";
const schema = z.object({
  DATABASE_URL: z.string().url(),
  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.string().url(),
  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
});
export function authEnv() {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success)
    throw new Error("Authentication environment is incomplete or invalid.");
  return { ...parsed.data, BETTER_AUTH_URL: publicOrigin() };
}
// Reserved test identity, never a credential or an existing student account.
export const REVIEW_USER_ID = "cashfree-review-test-student";
export function reviewLoginEnabled() {
  return process.env.ENABLE_CASHFREE_REVIEW_LOGIN === "true";
}
export function configuredRole(user: {
  id?: string;
  email: string;
  emailVerified: boolean;
}): "admin" | "student" {
  if (user.id === REVIEW_USER_ID) return "student";
  const emails = (process.env.ADMIN_EMAILS ?? process.env.ADMIN_EMAIL ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter((email) => z.email().safeParse(email).success);
  return user.emailVerified && emails.includes(user.email.trim().toLowerCase())
    ? "admin"
    : "student";
}
export function requiredEnv(key: string) {
  const value = process.env[key]?.trim();
  if (!value) throw new Error(`Missing server configuration: ${key}`);
  return value;
}
export function getAdminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? process.env.ADMIN_EMAIL ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter((email) => z.email().safeParse(email).success);
}

// One trusted origin for authentication, payment callbacks, and email links.
// Local development is allowed only outside production; payment callbacks always require HTTPS.
export function publicOrigin(
  requireHttps = process.env.NODE_ENV === "production",
) {
  let url: URL;
  try {
    url = new URL(requiredEnv("BETTER_AUTH_URL"));
  } catch {
    throw new AppError(
      "Configure a valid portal origin in BETTER_AUTH_URL.",
      503,
    );
  }
  const localOrTunnel =
    /^(localhost|127(?:\.\d+){3}|\[::1\])$/.test(url.hostname) ||
    /(?:^|\.)(?:localhost|ngrok\.io|ngrok\.app|ngrok-free\.app|ngrok-free\.dev)$/.test(
      url.hostname,
    );
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash ||
    (requireHttps && (url.protocol !== "https:" || localOrTunnel))
  ) {
    throw new AppError(
      "Configure the public HTTPS portal origin in BETTER_AUTH_URL.",
      503,
    );
  }
  return url.origin;
}
