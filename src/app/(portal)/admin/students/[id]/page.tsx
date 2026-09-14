import { AdmissionActions } from "@/components/admission-actions";
import { AdminCollection } from "@/components/admin-collection";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Phone, GraduationCap } from "lucide-react";
import { requireAdmin } from "@/lib/access";
import { getStudent, studentData } from "@/lib/data";
import { money, dateLabel } from "@/lib/money";
import { AddFee, EditFee, MonthlyRent } from "@/components/admin-actions";
import { PaymentHistory } from "@/components/payment-history";
export default async function StudentDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;
  const student = await getStudent(id);
  if (!student) notFound();
  const data = await studentData(id);
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Link
        href="/admin/students"
        className="flex min-h-10 items-center gap-2 text-sm text-muted-foreground"
      >
        <ArrowLeft className="size-4" />
        Students
      </Link>
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">
          {student.profile?.fullName || student.user.name}
        </h1>
        <div className="mt-3 flex flex-wrap gap-4 text-sm text-muted-foreground">
          {student.profile ? (
            <>
              <a
                href={`tel:${student.profile.phone}`}
                className="flex items-center gap-2"
              >
                <Phone className="size-4" />
                {student.profile.phone}
              </a>
              <span className="flex items-center gap-2">
                <GraduationCap className="size-4" />
                {student.profile.course} · {student.profile.trade} ·{" "}
                {student.profile.studyYear}
              </span>
            </>
          ) : (
            <p>
              Profile incomplete. The student needs to finish the short
              introduction.
            </p>
          )}
        </div>
      </div>
      <div className="space-y-3">
        <p className="text-sm font-semibold">
          Admission: {student.user.approvalStatus}
        </p>
        <AdmissionActions
          id={id}
          status={student.user.approvalStatus}
          revision={student.user.approvalRevision}
        />
      </div>
      {student.profile && student.user.approvalStatus === "accepted" && (
        <AddFee userId={id} />
      )}
      <MonthlyRent
        key={student.user.monthlyRent}
        userId={id}
        amount={student.user.monthlyRent}
      />
      <h2 className="text-lg font-semibold">Fee details</h2>
      {data.dues.length ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {data.dues.map((f) => (
            <div key={`${f.id}-${f.revision}`} className="space-y-2">
              <EditFee fee={{ ...f, pending: !!f.pending }} />
              {student.user.approvalStatus === "accepted" &&
                f.outstanding > 0 &&
                !f.pending && (
                  <AdminCollection
                    feeDueId={f.id}
                    outstanding={f.outstanding}
                  />
                )}
            </div>
          ))}
        </div>
      ) : (
        <p className="rounded-xl border border-border bg-white p-5 text-sm text-muted-foreground">
          No fees assigned yet.
        </p>
      )}
      {data.dues.some((f) => f.paid + f.waivedAmount > f.amount) && (
        <p
          role="status"
          className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"
        >
          This account has an excess payment or adjustment. Reconcile it with
          the student before assigning another fee.
        </p>
      )}
      {data.dues.some((f) => f.audit.length) && (
        <details className="rounded-xl border border-border bg-white p-5">
          <summary className="cursor-pointer text-sm font-semibold">
            Fee adjustment history
          </summary>
          <div className="mt-4 space-y-3">
            {data.dues.flatMap((f) =>
              f.audit.map((a, i) => (
                <div
                  key={`${f.id}-${i}`}
                  className="border-b border-border pb-3 text-xs last:border-0"
                >
                  <p className="font-semibold">
                    {f.label} · {a.action} · {dateLabel(a.at)}
                  </p>
                  <p className="mt-1">{a.note}</p>
                  <p className="mt-1 break-all text-muted-foreground">
                    Previous fee {money(a.amount)}, adjustment{" "}
                    {money(a.waivedAmount)}, due {dateLabel(a.dueDate)} · Admin{" "}
                    {a.actor}
                  </p>
                </div>
              )),
            )}
          </div>
        </details>
      )}
      <h2 className="text-lg font-semibold">Complete payment history</h2>
      {data.history
        .filter((p) => p.method === "admin_manual")
        .map((p) => (
          <div key={`${p.id}-${p.revision}`} className="space-y-2">
            <p className="text-sm">
              Admin collection · {money(p.amount)} ·{" "}
              {p.status === "verified" ? "Paid" : "Voided"}
            </p>
            <AdminCollection
              feeDueId={p.feeDueId}
              outstanding={0}
              payment={{
                id: p.id,
                amount: p.amount,
                paymentDate: p.paymentDate,
                revision: p.revision,
                status: p.status,
              }}
            />
            {p.adminAudit.length > 0 && (
              <details className="p-3 text-xs">
                <summary>Collection correction history</summary>
                {p.adminAudit.map((a, i) => (
                  <p className="mt-2" key={i}>
                    {dateLabel(a.at)} · Previously {money(a.previousAmount)} (
                    {a.previousStatus}) · {a.note} · Admin {a.actor}
                  </p>
                ))}
              </details>
            )}
          </div>
        ))}
      <PaymentHistory
        history={data.history}
        labels={Object.fromEntries(data.dues.map((f) => [f.id, f.label]))}
      />
    </div>
  );
}
