import Link from "next/link";
import { and, eq, ne, desc } from "drizzle-orm";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { requireAdmin } from "@/lib/access";
import { Card } from "@/components/ui/card";
import { AdmissionActions } from "@/components/admission-actions";
export default async function PendingStudents() {
  await requireAdmin();
  const students = await getDb()
    .select()
    .from(users)
    .where(and(eq(users.role, "student"), ne(users.approvalStatus, "accepted")))
    .orderBy(desc(users.createdAt));
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold">Pending students</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Accept a student to enable access and start ₹1,000 monthly rent.
        </p>
      </div>
      {["pending", "rejected"].map((status) => (
        <section key={status} className="space-y-3">
          <h2 className="text-lg font-semibold">
            {status === "pending" ? "Waiting for approval" : "Rejected"} ·{" "}
            {students.filter((s) => s.approvalStatus === status).length}
          </h2>
          <div className="grid gap-4 md:grid-cols-2">
            {students
              .filter((s) => s.approvalStatus === status)
              .map((s) => (
                <Card key={`${s.id}-${s.approvalRevision}`}>
                  <Link
                    href={`/admin/students/${s.id}`}
                    className="font-semibold"
                  >
                    {s.name}
                  </Link>
                  <p className="mb-5 mt-1 break-all text-sm text-muted-foreground">
                    {s.email}
                  </p>
                  <AdmissionActions
                    id={s.id}
                    status={s.approvalStatus}
                    revision={s.approvalRevision}
                  />
                </Card>
              ))}
          </div>
          {!students.some((s) => s.approvalStatus === status) && (
            <p className="text-sm text-muted-foreground">
              No {status} students.
            </p>
          )}
        </section>
      ))}
    </div>
  );
}
