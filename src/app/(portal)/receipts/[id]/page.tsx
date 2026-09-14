import { expireProviderAttempts } from "@/lib/ledger";
import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { ReceiptText, ArrowLeft, ShieldCheck } from "lucide-react";
import { getDb } from "@/db";
import { payments, feeDues, users } from "@/db/schema";
import { requireUser } from "@/lib/access";
import { dateLabel, money, paymentMethodLabel } from "@/lib/money";
import { StatusBadge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Reconcile,
  PrintReceipt,
  ReviewPayment,
} from "@/components/admin-actions";
export default async function Receipt({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  await expireProviderAttempts(user.id);
  const { id } = await params;
  const [row] = await getDb()
    .select({ payment: payments, fee: feeDues, name: users.name })
    .from(payments)
    .innerJoin(feeDues, eq(payments.feeDueId, feeDues.id))
    .innerJoin(users, eq(users.id, payments.userId))
    .where(eq(payments.id, id));
  if (!row || (row.payment.userId !== user.id && user.role !== "admin"))
    notFound();
  const { payment: p, fee, name } = row;
  return (
    <div className="mx-auto max-w-lg space-y-5">
      <Link
        href={
          user.role === "admin"
            ? `/admin/students/${p.userId}`
            : "/student/history"
        }
        className="no-print flex min-h-11 items-center gap-2 text-sm text-muted-foreground"
      >
        <ArrowLeft className="size-4" />
        Payment history
      </Link>
      <Card className="sm:p-8">
        <div className="text-center">
          <ReceiptText className="mx-auto mb-4 size-9 text-primary" />
          <p className="text-xs font-semibold tracking-widest text-muted-foreground">
            {p.status === "verified" ? "PAYMENT RECEIPT" : "PAYMENT DETAILS"}
          </p>
          <h1 className="my-4 text-4xl font-semibold tracking-tight">
            {money(p.amount)}
          </h1>
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
        <dl className="my-7 space-y-4 border-y border-dashed border-border py-6 text-sm">
          {[
            ["Student", name],
            ["Fee", fee.label],
            ["Method", paymentMethodLabel(p.method)],
            ["Date", dateLabel(p.paymentDate || p.createdAt)],
            ["Reference", p.id],
            ...(p.razorpayPaymentId
              ? [["Payment ID", p.razorpayPaymentId]]
              : []),
            ...(p.reviewedAt ? [["Reviewed", dateLabel(p.reviewedAt)]] : []),
          ].map(([label, value]) => (
            <div key={label} className="flex justify-between gap-4">
              <dt className="shrink-0 text-muted-foreground">{label}</dt>
              <dd className="min-w-0 break-all text-right font-medium">
                {value}
              </dd>
            </div>
          ))}
        </dl>
        {p.reviewNote && (
          <p className="mb-5 rounded-xl bg-muted p-4 text-sm">
            Office note: {p.reviewNote}
          </p>
        )}
        {p.status === "pending" && p.method === "manual_upi" && (
          <p className="mb-5 text-sm leading-6 text-amber-800">
            The office will check your screenshot. Please don’t pay again.
            <br />
            जाँच बाकी है। दोबारा भुगतान न करें।
          </p>
        )}
        {p.method === "razorpay" && p.status !== "verified" && (
          <div className="no-print mb-5">
            <Reconcile id={p.id} />
          </div>
        )}
        {p.screenshotPublicId && (
          <div className="no-print mb-4 space-y-2">
            <p className="text-xs font-semibold text-muted-foreground">
              Payment Screenshot
            </p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/api/payments/${p.id}/screenshot`}
              alt="Payment screenshot"
              className="w-full rounded-xl border border-border"
              loading="lazy"
            />
            <a
              className="flex min-h-10 items-center justify-center text-xs font-medium text-primary"
              href={`/api/payments/${p.id}/screenshot`}
              target="_blank"
              rel="noreferrer"
            >
              Open full size ↗
            </a>
          </div>
        )}
        {user.role === "admin" &&
          p.method === "manual_upi" &&
          p.status === "pending" && (
            <div className="no-print mb-5">
              <ReviewPayment id={p.id} hasScreenshot={!!p.screenshotPublicId} />
            </div>
          )}
        {p.status === "verified" && (
          <div className="text-center">
            <PrintReceipt />
            <p className="mt-5 flex items-center justify-center gap-2 text-xs text-muted-foreground">
              <ShieldCheck className="size-4" />
              Verified by Apna Hostel
            </p>
          </div>
        )}
      </Card>
    </div>
  );
}
