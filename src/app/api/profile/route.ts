import { rateLimit } from "@/lib/rate-limit";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { studentProfiles, users } from "@/db/schema";
import { requireUser } from "@/lib/access";
import { mutation, jsonBody } from "@/lib/http";
import { profileSchema } from "@/lib/validation";
export const POST = mutation(async (req) => {
  const user = await requireUser();
  await rateLimit(user.id, "profile", 20);
  const values = profileSchema.parse(await jsonBody(req));
  await getDb().transaction(async (tx) => {
    await tx
      .insert(studentProfiles)
      .values({ userId: user.id, ...values })
      .onConflictDoUpdate({ target: studentProfiles.userId, set: values });
    await tx
      .update(users)
      .set({ name: values.fullName, updatedAt: new Date() })
      .where(eq(users.id, user.id));
  });
  return Response.json({ ok: true });
});
