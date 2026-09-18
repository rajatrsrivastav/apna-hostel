import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { APIError, createAuthEndpoint } from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
import { z } from "zod";
import { getDb } from "@/db";
import { users, studentProfiles, accounts, payments } from "@/db/schema";
import { REVIEW_USER_ID, reviewLoginEnabled } from "./env";
import { AppError } from "./errors";
import { checkOrigin } from "./http";
import { rateLimit } from "./rate-limit";
import { generateMonthlyRent } from "./rent";

function matches(value: string, expected: string) {
  return timingSafeEqual(
    createHash("sha256").update(value).digest(),
    createHash("sha256").update(expected).digest(),
  );
}
async function reviewStudent(email: string) {
  return getDb().transaction(async (tx) => {
    // Never find or promote a real account by its email. Conflicts fail closed.
    const [collision] = await tx
      .select()
      .from(users)
      .where(eq(users.email, email));
    if (collision && collision.id !== REVIEW_USER_ID)
      throw new APIError("SERVICE_UNAVAILABLE", {
        message: "Review login is unavailable.",
      });
    await tx
      .insert(users)
      .values({
        id: REVIEW_USER_ID,
        name: "Cashfree TEST STUDENT",
        email,
        emailVerified: false,
        role: "student",
        approvalStatus: "accepted",
        acceptedAt: new Date(),
        monthlyRent: 100000,
      })
      .onConflictDoNothing();
    const [user] = await tx
      .select()
      .from(users)
      .where(eq(users.id, REVIEW_USER_ID))
      .for("update");
    const linked = await tx
      .select()
      .from(accounts)
      .where(eq(accounts.userId, REVIEW_USER_ID));
    if (
      !user ||
      user.email !== email ||
      linked.length ||
      user.emailVerified ||
      user.role !== "student" ||
      user.approvalStatus !== "accepted"
    )
      throw new APIError("SERVICE_UNAVAILABLE", {
        message: "Review login is unavailable.",
      });
    await tx
      .insert(studentProfiles)
      .values({
        userId: user.id,
        fullName: "Cashfree TEST STUDENT",
        phone: "9999999999",
        course: "ITI",
        trade: "Test",
        studyYear: "Test",
      })
      .onConflictDoUpdate({
        target: studentProfiles.userId,
        set: { phone: "9999999999" },
      });
    await tx.delete(payments).where(eq(payments.userId, user.id));
    await generateMonthlyRent(user.id, new Date(), tx);
    return user;
  });
}

// A separate Better Auth endpoint; password sign-in/signup remain disabled.
export const reviewLoginPlugin = {
  id: "cashfree-review-login",
  endpoints: {
    signInReview: createAuthEndpoint(
      "/review-login",
      {
        method: "POST",
        body: z.object({
          email: z.string().max(254),
          password: z.string().max(1024),
        }),
      },
      async (ctx) => {
        if (!reviewLoginEnabled()) throw new APIError("NOT_FOUND");
        if (!ctx.request) throw new APIError("FORBIDDEN");
        try {
          checkOrigin(ctx.request);
          // Global limiter cannot be bypassed by rotating emails or spoofing IP headers.
          await rateLimit("reviewer", "review-login", 5);
        } catch (error) {
          if (error instanceof AppError)
            throw new APIError(
              error.status === 429 ? "TOO_MANY_REQUESTS" : "FORBIDDEN",
              { message: error.message },
            );
          throw error;
        }
        const email = process.env.CASHFREE_REVIEW_EMAIL?.trim().toLowerCase();
        const password = process.env.CASHFREE_REVIEW_PASSWORD;
        if (
          !email ||
          !z.email().safeParse(email).success ||
          !password ||
          password.length < 16 ||
          email === process.env.ADMIN_EMAIL?.trim().toLowerCase()
        )
          throw new APIError("SERVICE_UNAVAILABLE", {
            message: "Review login is unavailable.",
          });
        const emailMatches = matches(
          ctx.body.email.trim().toLowerCase(),
          email,
        );
        const passwordMatches = matches(ctx.body.password, password);
        if (!emailMatches || !passwordMatches)
          throw new APIError("UNAUTHORIZED", {
            message: "Invalid review credentials.",
          });
        const user = await reviewStudent(email);
        const session = await ctx.context.internalAdapter.createSession(
          user.id,
        );
        if (!session) throw new APIError("INTERNAL_SERVER_ERROR");
        await setSessionCookie(ctx, { session, user });
        ctx.setHeader("Cache-Control", "private, no-store");
        return ctx.json({ ok: true });
      },
    ),
  },
};
