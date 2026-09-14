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
  email: string;
  emailVerified: boolean;
}): "admin" | "student" {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  return email &&
    user.emailVerified &&
    user.email.trim().toLowerCase() === email
    ? "admin"
    : "student";
}
export function requiredEnv(key: string) {
  const value = process.env[key];
  if (!value) throw new Error(`Missing server configuration: ${key}`);
  return value;
}
