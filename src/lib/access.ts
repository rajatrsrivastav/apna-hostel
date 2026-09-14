import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { getAuth } from "./auth";
import { getDb } from "@/db";
import { users, studentProfiles, sessions } from "@/db/schema";
import { configuredRole, REVIEW_USER_ID, reviewLoginEnabled } from "./env";
import { AppError } from "./errors";
export async function currentUser() {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) return null;
  if (session.user.id === REVIEW_USER_ID && !reviewLoginEnabled()) {
    await getDb().delete(sessions).where(eq(sessions.userId, REVIEW_USER_ID));
    return null;
  }
  const [user] = await getDb()
    .select()
    .from(users)
    .where(eq(users.id, session.user.id));
  if (!user) return null;
  const role = configuredRole(user);
  if (user.role !== role) {
    await getDb()
      .update(users)
      .set({ role, updatedAt: new Date() })
      .where(eq(users.id, user.id));
  }
  return { ...user, role };
}
export function homePath(user: { role: string; approvalStatus: string }) {
  return user.role === "admin"
    ? "/admin"
    : user.approvalStatus === "accepted"
      ? "/dashboard"
      : "/approval";
}
export async function requireUser() {
  const user = await currentUser();
  if (!user) throw new AppError("Please sign in again.", 401);
  if (user.role !== "admin" && user.approvalStatus !== "accepted")
    throw new AppError(
      "Approval Pending / Admin se approval pending hai.",
      403,
    );
  return user;
}
export async function requireAdmin() {
  const user = await requireUser();
  if (user.role !== "admin") throw new AppError("Admin access required.", 403);
  return user;
}
export async function studentPage() {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (user.role === "admin") redirect("/admin");
  if (user.approvalStatus !== "accepted") redirect("/approval");
  const [profile] = await getDb()
    .select()
    .from(studentProfiles)
    .where(eq(studentProfiles.userId, user.id));
  if (!profile) redirect("/onboarding");
  return { user, profile };
}
