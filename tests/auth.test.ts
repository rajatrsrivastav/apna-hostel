import { createHmac } from "node:crypto";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as schema from "@/db/schema";
const shared = vi.hoisted(() => ({ db: undefined as unknown }));
vi.mock("@/db", () => ({ getDb: () => shared.db }));
import { getAuth } from "@/lib/auth";
let client: PGlite;
beforeAll(async () => {
  client = new PGlite();
  const db = drizzle(client, { schema });
  shared.db = db;
  await migrate(db, { migrationsFolder: "./drizzle" });
  Object.assign(process.env, {
    DATABASE_URL: "postgresql://test:test@localhost/test",
    BETTER_AUTH_URL: "http://localhost:3000",
    BETTER_AUTH_SECRET: "test-only-secret-for-auth-adapter-123456789",
    GOOGLE_CLIENT_ID: "test-client",
    GOOGLE_CLIENT_SECRET: "test-secret",
  });
});
afterAll(async () => {
  await client.close();
});
it("Better Auth creates and reads real users and sessions through the migrated Drizzle schema", async () => {
  const context = await getAuth().$context;
  const user = await context.internalAdapter.createUser(
    { name: "Auth test", email: "auth@example.test", emailVerified: true },
    { method: "oauth" },
  );
  expect(user.id).toBeTruthy();
  expect(user.role).toBe("student");
  expect(user.approvalStatus).toBe("onboarding_incomplete");
  const session = await context.internalAdapter.createSession(user.id);
  expect(session?.token).toBeTruthy();
  const found = await context.internalAdapter.findSession(session!.token);
  expect(found?.user.email).toBe("auth@example.test");
});
it("Better Auth anonymous session endpoint returns no session with database rate limiting enabled", async () => {
  const response = await getAuth().handler(
    new Request("http://localhost:3000/api/auth/get-session", {
      headers: { "x-forwarded-for": "127.0.0.1" },
    }),
  );
  expect(response.status).toBe(200);
  expect(await response.json()).toBeNull();
});

it("assigns the configured verified Google email the admin role at creation", async () => {
  process.env.ADMIN_EMAIL = " ADMIN@example.test ";
  const context = await getAuth().$context;
  const user = await context.internalAdapter.createUser(
    { name: "Admin", email: "admin@example.test", emailVerified: true },
    { method: "oauth" },
  );
  expect(user.role).toBe("admin");
  process.env.ADMIN_EMAIL = "unverified@example.test";
  const unverified = await context.internalAdapter.createUser(
    {
      name: "Unverified",
      email: "unverified@example.test",
      emailVerified: false,
    },
    { method: "oauth" },
  );
  expect(unverified.role).toBe("student");
});

it("Google-session logout deletes the server session and clears its cookie", async () => {
  const context = await getAuth().$context;
  const user = await context.internalAdapter.createUser(
    { name: "Logout", email: "logout@example.test", emailVerified: true },
    { method: "oauth" },
  );
  const session = await context.internalAdapter.createSession(user.id);
  const signature = createHmac("sha256", process.env.BETTER_AUTH_SECRET!)
    .update(session!.token)
    .digest("base64");
  const cookie =
    context.authCookies.sessionToken.name +
    "=" +
    encodeURIComponent(session!.token + "." + signature);
  const signedIn = await getAuth().api.getSession({
    headers: new Headers({ cookie }),
  });
  expect(signedIn?.user.id).toBe(user.id);
  const response = await getAuth().handler(
    new Request("http://localhost:3000/api/auth/sign-out", {
      method: "POST",
      headers: {
        cookie,
        origin: "http://localhost:3000",
        "content-type": "application/json",
      },
      body: "{}",
    }),
  );
  expect(response.status).toBe(200);
  expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
  expect(await context.internalAdapter.findSession(session!.token)).toBeNull();
});

it("supports a trimmed case-insensitive admin allowlist and overrides the legacy email", async () => {
  process.env.ADMIN_EMAILS =
    " FIRST@example.test, ,second@example.test,invalid ";
  const { configuredRole } = await import("@/lib/env");
  expect(
    configuredRole({ email: "first@EXAMPLE.test", emailVerified: true }),
  ).toBe("admin");
  expect(
    configuredRole({ email: " second@example.test ", emailVerified: true }),
  ).toBe("admin");
  expect(
    configuredRole({ email: "second@example.test", emailVerified: false }),
  ).toBe("student");
  expect(
    configuredRole({ email: "outsider@example.test", emailVerified: true }),
  ).toBe("student");
  delete process.env.ADMIN_EMAILS;
});

it("removed review login returns 404 even with the old feature flag enabled", async () => {
  process.env.ENABLE_RAZORPAY_REVIEW_LOGIN = "true";
  try {
    const { POST } = await import("@/app/api/auth/[...all]/route");
    const response = await POST(
      new Request("http://localhost:3000/api/auth/review-login", {
        method: "POST",
        headers: {
          origin: "http://localhost:3000",
          "content-type": "application/json",
        },
        body: JSON.stringify({ email: "review@example.test", password: "old-password" }),
      }),
    );
    expect(response.status).toBe(404);
  } finally {
    delete process.env.ENABLE_RAZORPAY_REVIEW_LOGIN;
  }
});
