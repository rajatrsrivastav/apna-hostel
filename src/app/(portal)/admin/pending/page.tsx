import Link from "next/link";
import { requireAdmin } from "@/lib/access";
import { pendingStudents } from "@/lib/data";
import { Card } from "@/components/ui/card";
import { AdmissionActions } from "@/components/admission-actions";
export default async function PendingStudents() {
  await requireAdmin();
  const students = await pendingStudents();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold">Pending students</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Accept a student to enable access and start ₹1,000 monthly rent.
        </p>
      </div>
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">
          Waiting for approval · {students.length}
        </h2>
        <div className="grid gap-4 md:grid-cols-2">
          {students.map(({ user: s, profile }) => (
            <Card key={`${s.id}-${s.approvalRevision}`}>
              <Link href={`/admin/students/${s.id}`} className="font-semibold">
                {profile.fullName}
              </Link>
              <p className="mt-1 break-all text-sm text-muted-foreground">
                {s.email}
              </p>
              <dl className="mb-5 mt-3 space-y-1 text-sm">
                {[
                  ["Phone", profile.phone],
                  ["Course", profile.course],
                  ["Branch", profile.trade],
                  ["Year", profile.studyYear || "Not provided"],
                ].map(([label, value]) => (
                  <div key={label} className="flex gap-2">
                    <dt className="text-muted-foreground">{label}:</dt>
                    <dd className="min-w-0 break-words">{value}</dd>
                  </div>
                ))}
              </dl>
              <AdmissionActions id={s.id} status={s.approvalStatus} revision={s.approvalRevision} />
            </Card>
          ))}
        </div>
        {!students.length && (
          <p className="text-sm text-muted-foreground">No pending students.</p>
        )}
      </section>
    </div>
  );
}
