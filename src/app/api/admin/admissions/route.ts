import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { users, studentProfiles } from "@/db/schema";
import { requireAdmin } from "@/lib/access";
import { mutation, jsonBody } from "@/lib/http";
import { AppError } from "@/lib/errors";
import { idSchema } from "@/lib/validation";
import { rateLimit } from "@/lib/rate-limit";
import { configuredRole, publicOrigin } from "@/lib/env";
import { generateMonthlyRent } from "@/lib/rent";
export const POST = mutation(async (req) => {
  const admin = await requireAdmin();
  await rateLimit(admin.id, "admissions", 30);
  const input = z
    .object({
      id: idSchema,
      decision: z.enum(["accepted", "rejected"]),
      revision: z.number().int().nonnegative(),
    })
    .parse(await jsonBody(req));
  const result = await getDb().transaction(async (tx) => {
    const [student] = await tx
      .select()
      .from(users)
      .where(and(eq(users.id, input.id), eq(users.role, "student")))
      .for("update");
    if (!student || configuredRole(student) === "admin")
      throw new AppError("Student not found.", 404);
    const [profile] = await tx
      .select({ userId: studentProfiles.userId })
      .from(studentProfiles)
      .where(eq(studentProfiles.userId, student.id));
    if (!profile || student.approvalStatus === "onboarding_incomplete")
      throw new AppError("Student must complete onboarding first.", 409);
    if (student.approvalStatus === input.decision) return { student, newlyAccepted: false };
    if (student.approvalRevision !== input.revision)
      throw new AppError(
        "This student was already reviewed. Reload first.",
        409,
      );
    const now = new Date();
    // Finish only the currently accepted interval before access is revoked.
    if (student.approvalStatus === "accepted")
      await generateMonthlyRent(student.id, now, tx);
    await tx
      .update(users)
      .set({
        approvalStatus: input.decision,
        acceptedAt: input.decision === "accepted" ? now : student.acceptedAt,
        approvalRevision: student.approvalRevision + 1,
        approvalAudit: [
          ...student.approvalAudit,
          { actor: admin.id, decision: input.decision, at: now.toISOString() },
        ],
        updatedAt: now,
      })
      .where(eq(users.id, student.id));
    if (input.decision === "accepted")
      await generateMonthlyRent(student.id, now, tx);

    return { student, newlyAccepted: input.decision === "accepted" };
  });

  if (result?.newlyAccepted) {
    const { sendEmail, buildStudentApprovedEmail } = await import("@/lib/email");
    const dashboardUrl = `${publicOrigin()}/student`;
    
    await sendEmail({
      to: result.student.email,
      ...buildStudentApprovedEmail({
        studentName: result.student.name,
        dashboardUrl,
      }),
    }).catch((err) => {
      console.error("[Admissions] Failed to send approval email:", err instanceof Error ? err.name : "UnknownError");
    });
  }
  return Response.json({ ok: true });
});
