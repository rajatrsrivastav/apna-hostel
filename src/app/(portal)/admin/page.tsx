import Link from "next/link";
import {
  Users,
  CircleCheck,
  CircleAlert,
  Clock3,
  ArrowUpRight,
  Wallet,
  CalendarDays,
  ArrowRight,
  ShieldCheck,
} from "lucide-react";
import { requireAdmin } from "@/lib/access";
import { adminStudents, pendingReviews } from "@/lib/data";
import { money, dateLabel } from "@/lib/money";
import { Card } from "@/components/ui/card";
import { AdminStudents } from "@/components/admin-students";
export default async function AdminDashboard() {
  await requireAdmin();
  const [students, reviews] = await Promise.all([
    adminStudents(),
    pendingReviews(),
  ]);
  const collected = students.reduce((n, s) => n + s.paid, 0),
    outstanding = students.reduce((n, s) => n + s.outstanding, 0);
  const stats = [
    {
      label: "Total students",
      value: students.length,
      icon: Users,
      color: "bg-[#eef0e7] text-[#727f52]",
      detail: "Your hostel community",
    },
    {
      label: "Paid",
      value: students.filter((s) => s.status === "paid").length,
      icon: CircleCheck,
      color: "bg-emerald-50 text-emerald-700",
      detail: "Fees up to date",
    },
    {
      label: "Unpaid",
      value: students.filter((s) => s.status === "unpaid").length,
      icon: CircleAlert,
      color: "bg-red-50 text-red-600",
      detail: "Have an outstanding fee",
    },
    {
      label: "Verification pending",
      value: reviews.length,
      icon: Clock3,
      color: "bg-amber-50 text-amber-700",
      detail: "Manual payments to review",
    },
  ];
  return (
    <div className="space-y-7">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="mb-2 text-[10px] font-semibold tracking-[0.18em] text-muted-foreground">
            THE BIG PICTURE
          </p>
          <h1 className="text-3xl font-semibold tracking-tight">
            Hostel overview<span className="text-[#c48b4c]">.</span>
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            A little organisation. A lot of peace of mind.
          </p>
        </div>
        <span className="flex items-center gap-2 rounded-xl border border-border bg-white px-3 py-2.5 text-xs text-muted-foreground">
          <CalendarDays className="size-4" />
          {dateLabel(new Date())}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4 sm:gap-5">
        {stats.map(({ label, value, icon: Icon, color, detail }) => (
          <Card key={label} className="p-4 sm:p-5">
            <div className="flex items-center justify-between gap-2">
              <span
                className={`flex size-9 shrink-0 items-center justify-center rounded-xl ${color}`}
              >
                <Icon className="size-[18px]" />
              </span>
              <ArrowUpRight className="size-3.5 text-muted-foreground/50" />
            </div>
            <p className="mt-5 text-3xl font-semibold tracking-tight tabular-nums">
              {value}
            </p>
            <p className="mt-1.5 text-xs font-semibold sm:text-sm">{label}</p>
            <p className="mt-2 hidden text-[11px] text-muted-foreground sm:block">
              {detail}
            </p>
          </Card>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
        <div className="relative overflow-hidden rounded-2xl bg-[#254f3d] p-6 text-white sm:p-7">
          <div
            className="absolute -right-12 -top-12 size-60 rounded-full border-[28px] border-white/5"
            aria-hidden="true"
          />
          <div className="relative">
            <span className="flex items-center gap-2 text-xs text-white/75">
              <Wallet className="size-4" />
              Total amount collected
            </span>
            <p className="mt-4 text-4xl font-medium tracking-tight">
              {money(collected)}
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-white/15 pt-4 text-[11px] text-white/70">
              <ShieldCheck className="size-3.5" />
              Verified payments only
              <span className="ml-auto rounded-full bg-white/10 px-2 py-1">
                All time
              </span>
            </div>
          </div>
        </div>
        <Card className="flex flex-col justify-between">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs text-muted-foreground">
                Outstanding amount
              </p>
              <p className="mt-4 text-4xl font-medium tracking-tight">
                {money(outstanding)}
              </p>
            </div>
            <span className="rounded-xl bg-[#f6f0e7] p-2.5 text-[#a88658]">
              <Clock3 className="size-5" />
            </span>
          </div>
          <div className="mt-6 flex items-center justify-between border-t border-border pt-4 text-xs">
            <span className="text-muted-foreground">
              Across {students.filter((s) => s.outstanding > 0).length} students
            </span>
            <Link
              href="/admin/students"
              className="flex min-h-8 items-center gap-1 font-semibold text-primary"
            >
              View students
              <ArrowRight className="size-3.5" />
            </Link>
          </div>
        </Card>
      </div>
      {reviews.length > 0 && (
        <Link
          href="/admin/verification"
          className="flex items-center gap-4 rounded-xl border border-[#eadfc4] bg-[#faf6eb] p-4"
        >
          <span className="rounded-lg bg-[#f1e7cd] p-2 text-[#9d783a]">
            <Clock3 className="size-5" />
          </span>
          <div className="flex-1">
            <p className="text-sm font-semibold">
              {reviews.length} payment{reviews.length === 1 ? "" : "s"} waiting
              for a quick check
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Review UPI screenshots and keep students in the loop.
            </p>
          </div>
          <span className="hidden text-xs font-semibold text-[#8b6a35] sm:block">
            Review payments
          </span>
          <ArrowRight className="size-4 shrink-0 text-[#8b6a35]" />
        </Link>
      )}
      <AdminStudents
        students={students.map((s) => ({
          ...s,
          last_payment: s.last_payment
            ? new Date(s.last_payment).toISOString()
            : null,
        }))}
        compact
      />
    </div>
  );
}
