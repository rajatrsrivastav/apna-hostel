import "server-only";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { nextCookies } from "better-auth/next-js";
import { getDb } from "@/db";
import {
  users,
  sessions,
  accounts,
  verifications,
  rateLimits,
} from "@/db/schema";
import { reviewLoginPlugin } from "./review-login";
import { authEnv, configuredRole } from "./env";
let instance: ReturnType<typeof createAuth> | undefined;
function createAuth() {
  const env = authEnv();
  return betterAuth({
    appName: "Apna Hostel",
    baseURL: env.BETTER_AUTH_URL,
    secret: env.BETTER_AUTH_SECRET,
    database: drizzleAdapter(getDb(), {
      provider: "pg",
      schema: {
        user: users,
        session: sessions,
        account: accounts,
        verification: verifications,
        rateLimit: rateLimits,
      },
    }),
    socialProviders: {
      google: {
        clientId: env.GOOGLE_CLIENT_ID,
        clientSecret: env.GOOGLE_CLIENT_SECRET,
      },
    },
    databaseHooks: {
      user: {
        create: {
          before: async (user) => ({
            data: { ...user, role: configuredRole(user) },
          }),
        },
      },
    },
    user: {
      additionalFields: {
        approvalStatus: {
          type: "string",
          defaultValue: "pending",
          input: false,
        },
        role: { type: "string", defaultValue: "student", input: false },
      },
    },
    session: {
      expiresIn: 60 * 60 * 24 * 7,
      updateAge: 60 * 60 * 24,
      cookieCache: { enabled: false },
    },
    advanced: {
      useSecureCookies: new URL(env.BETTER_AUTH_URL).protocol === "https:",
    },
    rateLimit: { enabled: true, storage: "database", window: 60, max: 60 },
    trustedOrigins: [new URL(env.BETTER_AUTH_URL).origin],
    plugins: [reviewLoginPlugin, nextCookies()],
  });
}
export function getAuth() {
  return (instance ??= createAuth());
}
