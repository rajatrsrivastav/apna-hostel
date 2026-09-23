import { studentPage } from "@/lib/access";
import { studentData } from "@/lib/data";
import { PaymentHistory } from "@/components/payment-history";
import { PaymentHistoryStatus } from "@/components/payment-history-status";
import { money } from "@/lib/money";
export default async function HistoryPage({ searchParams }: { searchParams: Promise<{ order_id?: string }> }) {
  const { order_id: orderId } = await searchParams;
  const { user } = await studentPage();
  const data = await studentData(user.id);
  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="text-3xl font-semibold tracking-tight">Your payments</h1>
      <p className="mb-7 mt-2 text-sm text-muted-foreground">
        भुगतान का रिकॉर्ड · Tap a payment for details.
      </p>
      <div className="mb-6 rounded-2xl bg-primary p-6 text-white">
        <p className="text-xs text-white/75">TOTAL PAID</p>
        <p className="mt-2 text-3xl font-semibold">{money(data.totalPaid)}</p>
      </div>
      {orderId && data.history.some((p) => p.cashfreeOrderId === orderId) && (
        <PaymentHistoryStatus orderId={orderId} />
      )}
      <PaymentHistory
        history={data.history}
        labels={Object.fromEntries(data.dues.map((f) => [f.id, f.label]))}
      />
    </div>
  );
}
