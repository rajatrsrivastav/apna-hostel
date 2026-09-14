import Link from "next/link";
import { ArrowDownLeft, ArrowUpRight, ReceiptText } from "lucide-react";
import { Card } from "./ui/card";
import { StatusBadge } from "./ui/badge";
import { dateLabel, money, paymentMethodLabel } from "@/lib/money";
import type { payments } from "@/db/schema";
export function PaymentHistory({
  history,
  labels = {},
}: {
  history: (typeof payments.$inferSelect)[];
  labels?: Record<string, string>;
}) {
  if (!history.length)
    return (
      <Card className="flex flex-col items-center py-12 text-center">
        <span className="mb-4 rounded-2xl bg-muted p-4">
          <ReceiptText className="size-7 text-muted-foreground" />
        </span>
        <h3 className="font-semibold">A fresh start.</h3>
        <p className="mt-2 max-w-xs text-sm leading-6 text-muted-foreground">
          Your payments and receipts will appear here.
        </p>
      </Card>
    );
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-white">
      {history.map((p) => (
        <Link
          key={p.id}
          href={`/receipts/${p.id}`}
          className="flex min-h-24 items-center gap-3 border-b border-border p-4 last:border-0 hover:bg-muted/60 sm:gap-4 sm:p-5"
        >
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted text-primary">
            <ArrowDownLeft className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">
              {labels[p.feeDueId] || "Hostel fee"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {dateLabel(p.paymentDate || p.createdAt)} ·{" "}
              {paymentMethodLabel(p.method)}
            </p>
            <div className="mt-2 sm:hidden">
              <StatusBadge
                status={
                  p.method === "razorpay" &&
                  !p.attemptStatus &&
                  p.status === "pending"
                    ? "processing"
                    : (p.attemptStatus ?? p.status)
                }
              />
            </div>
          </div>
          <div className="shrink-0 text-right">
            <p className="font-semibold tabular-nums">{money(p.amount)}</p>
            <div className="mt-1.5 hidden sm:block">
              <StatusBadge
                status={
                  p.method === "razorpay" &&
                  !p.attemptStatus &&
                  p.status === "pending"
                    ? "processing"
                    : (p.attemptStatus ?? p.status)
                }
              />
            </div>
          </div>
          <ArrowUpRight className="hidden size-4 text-muted-foreground sm:block" />
        </Link>
      ))}
    </div>
  );
}
