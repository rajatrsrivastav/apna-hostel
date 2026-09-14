import "server-only";
import { z } from "zod";
const schema = z.object({
  DATABASE_URL: z.string().url(),
  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.string().url(),
  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
});
export function authEnv() {
  return schema.parse(process.env);
}
export function configuredRole(user: {
  id?: string;
  email: string;
  emailVerified: boolean;
}): "admin" | "student" {
  const emails = (process.env.ADMIN_EMAILS ?? process.env.ADMIN_EMAIL ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter((email) => z.email().safeParse(email).success);
  return user.emailVerified && emails.includes(user.email.trim().toLowerCase())
    ? "admin"
    : "student";
}
export function requiredEnv(key: string) {
  const value = process.env[key];
  if (!value) throw new Error(`Missing server configuration: ${key}`);
  return value;
}
