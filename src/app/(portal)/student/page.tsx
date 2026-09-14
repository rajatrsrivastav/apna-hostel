import Link from "next/link";
import {
  ArrowRight,
  CalendarDays,
  CircleHelp,
  Clock3,
  ShieldCheck,
  Wallet,
  CheckCheck,
} from "lucide-react";
import { studentPage } from "@/lib/access";
import { studentData } from "@/lib/data";
import { dateLabel, money, feeStatus } from "@/lib/money";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badge";
import { PaymentHistory } from "@/components/payment-history";
export default async function StudentDashboard() {
  const { user, profile } = await studentPage();
  const data = await studentData(user.id);
  const next = data.dues.find((f) => f.outstanding > 0);
  const pending = data.history.some(
    (p) => p.status === "pending" && p.method === "manual_upi",
  );
  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-7 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">
            YOUR STUDENT SPACE
          </p>
          <h1 className="text-3xl font-semibold tracking-tight">
            Hi, {profile.fullName.split(" ")[0]}{" "}
            <span className="text-[#c48b4c]">✦</span>
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            नमस्ते! Your fee, all in one place.
          </p>
        </div>
        <span className="rounded-full border border-border bg-white px-3 py-2 text-xs text-muted-foreground">
          {profile.course} · {profile.studyYear}
        </span>
      </div>
      <Card className="relative overflow-hidden border-[#d9e4d4] bg-[#edf3e7] p-6 sm:p-8">
        <div
          className="absolute -right-12 -top-16 size-64 rounded-full border-[35px] border-white/40"
          aria-hidden="true"
        />
        <div className="relative">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="flex items-center gap-2 text-sm font-medium">
              <Wallet className="size-4" />
              Your hostel fee
            </span>
            <StatusBadge status={feeStatus(data.totalDue, pending)} />
          </div>
          <div className="my-5 grid grid-cols-2 gap-4 border-b border-primary/15 pb-5">
            <div>
              <p className="text-xs text-muted-foreground">
                Current Month Rent
              </p>
              <p className="mt-1 text-xl font-semibold">
                {money(data.currentMonthRent)}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Remaining {money(data.currentMonthDue)}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">
                Previous Due / पिछला बाकी
              </p>
              <p className="mt-1 text-xl font-semibold">
                {money(data.previousDue)}
              </p>
            </div>
          </div>
          <p className="text-sm text-muted-foreground">Total Due / कुल बाकी</p>
          <p className="mt-2 break-words text-5xl font-semibold tracking-[-0.05em] sm:text-6xl">
            {money(data.totalDue)}
          </p>
          {next ? (
            <p className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
              <CalendarDays className="size-4" />
              Next due {dateLabel(next.dueDate)}
            </p>
          ) : (
            <p className="mt-4 text-sm text-muted-foreground">
              {data.dues.length
                ? "All sorted. You’re up to date!"
                : "The office will add your fee soon."}
            </p>
          )}
          <div className="mt-7 max-w-sm">
            {data.totalDue > 0 ? (
              <Button size="lg" asChild className="w-full">
                <Link href="/student/pay">
                  Pay Now / फीस भरें
                  <ArrowRight className="ml-auto" />
                </Link>
              </Button>
            ) : (
              <span className="inline-flex items-center gap-2 text-sm font-semibold text-primary">
                <CheckCheck className="size-5" />
                {data.dues.length
                  ? "Nothing to pay right now"
                  : "Welcome to your hostel"}
              </span>
            )}
          </div>
        </div>
      </Card>
      {pending && (
        <div className="mt-4 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <Clock3 className="mt-0.5 size-5 shrink-0" />
          <div>
            <p className="font-semibold">Screenshot received / जाँच बाकी है</p>
            <p className="mt-1 text-xs leading-5">
              The office is checking your payment. Please don’t pay that fee
              again.
            </p>
          </div>
        </div>
      )}
      <div className="mb-5 mt-9 flex items-center justify-between">
        <h2 className="text-lg font-semibold tracking-tight">
          Recent payments
        </h2>
        <Link
          href="/student/history"
          className="flex min-h-12 items-center gap-1 text-xs font-semibold text-primary"
        >
          View all
          <ArrowRight className="size-3.5" />
        </Link>
      </div>
      <PaymentHistory
        history={data.history.slice(0, 3)}
        labels={Object.fromEntries(data.dues.map((f) => [f.id, f.label]))}
      />
      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <div className="flex items-center gap-3 rounded-xl p-3 text-xs text-muted-foreground">
          <ShieldCheck className="size-5 text-primary" />
          <span>
            Secure payments.
            <br />
            <span className="mt-1 inline-block">
              Your receipt is always here.
            </span>
          </span>
        </div>
        <Link
          href="/student/help"
          className="flex items-center gap-3 rounded-xl border border-border bg-white p-4 text-sm"
        >
          <CircleHelp className="size-5 text-primary" />
          <span>Need help? / मदद चाहिए?</span>
          <ArrowRight className="ml-auto size-4" />
        </Link>
      </div>
    </div>
  );
}
