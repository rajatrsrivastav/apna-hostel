import Link from "next/link";
import { CheckCheck, ArrowUpRight, Clock3 } from "lucide-react";
import { requireAdmin } from "@/lib/access";
import { pendingReviews } from "@/lib/data";
import { money, dateLabel } from "@/lib/money";
import { Card } from "@/components/ui/card";
import { ReviewPayment } from "@/components/admin-actions";
export default async function Verification() {
  await requireAdmin();
  const reviews = await pendingReviews();
  return (
    <div>
      <h1 className="text-3xl font-semibold tracking-tight">
        A quick check<span className="text-[#c48b4c]">.</span>
      </h1>
      <p className="mb-7 mt-2 text-sm text-muted-foreground">
        Match each screenshot with the payment in your UPI or bank account.
      </p>
      {reviews.length ? (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {reviews.map(({ payment: p, name, label }) => (
            <Card key={p.id}>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-xs text-amber-800">
                  <Clock3 className="size-3.5" />
                  Awaiting verification
                </span>
                <Link
                  href={`/receipts/${p.id}`}
                  aria-label={`Payment from ${name}`}
                  className="flex size-11 items-center justify-center"
                >
                  <ArrowUpRight className="size-4" />
                </Link>
              </div>
              <p className="mt-3 text-3xl font-semibold">{money(p.amount)}</p>
              <Link
                href={`/admin/students/${p.userId}`}
                className="mt-3 block font-semibold"
              >
                {name}
              </Link>
              <p className="mb-6 mt-1 text-xs leading-5 text-muted-foreground">
                {label}
                <br />
                Paid {dateLabel(p.paymentDate || p.createdAt)}
              </p>
              {!p.screenshotPublicId && (
                <p className="mb-3 text-xs text-amber-800">
                  Upload incomplete. Reject this entry if it remains incomplete
                  so the student can retry.
                </p>
              )}
              <ReviewPayment id={p.id} hasScreenshot={!!p.screenshotPublicId} />
            </Card>
          ))}
        </div>
      ) : (
        <Card className="py-16 text-center">
          <CheckCheck className="mx-auto mb-4 size-10 text-primary" />
          <h2 className="text-xl font-semibold">You’re all caught up.</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            New UPI screenshots will appear here for verification.
          </p>
        </Card>
      )}
    </div>
  );
}
