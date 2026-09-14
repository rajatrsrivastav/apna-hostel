import { AppError } from "@/lib/errors";
import { rateLimit } from "@/lib/rate-limit";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { studentProfiles, users } from "@/db/schema";
import { currentUser } from "@/lib/access";
import { mutation, jsonBody } from "@/lib/http";
import { profileSchema } from "@/lib/validation";
export const POST = mutation(async (req) => {
  const user = await currentUser();
  if (!user) throw new AppError("Please sign in again.", 401);
  if (user.role === "admin") throw new AppError("Student profile only.", 403);
  await rateLimit(user.id, "profile", 20);
  const values = profileSchema.parse(await jsonBody(req));
  await getDb().transaction(async (tx) => {
    await tx
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, user.id))
      .for("update");
    // Keep the legacy year column empty; onboarding collects only four fields.
    const inserted = await tx
      .insert(studentProfiles)
      .values({ userId: user.id, ...values, studyYear: "" })
      .onConflictDoNothing()
      .returning({ userId: studentProfiles.userId });
    if (!inserted.length) return;
    await tx
      .update(users)
      .set({
        name: values.fullName,
        approvalStatus: "pending",
        acceptedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(users.id, user.id));
  });
  return Response.json({ ok: true });
});
