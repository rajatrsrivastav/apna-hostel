"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { api } from "./form-kit";

type Result = {
  status: string;
  attemptStatus: string | null;
  paid: boolean;
  retrySafe: boolean;
  message: string;
};

export function PaymentHistoryStatus({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");

  async function check() {
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const current = await api<Result>("/api/payments/verify", { order_id: orderId });
      setResult(current);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not check payment status.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    let active = true;
    api<Result>("/api/payments/verify", { order_id: orderId })
      .then((current) => {
        if (!active) return;
        setResult(current);
        router.refresh();
      })
      .catch((cause) => {
        if (!active) return;
        setError(cause instanceof Error ? cause.message : "Could not check payment status.");
        setBusy(false);
      });
    return () => { active = false; };
  }, [orderId, router]);

  return (
    <Card className="mb-6" aria-live="polite">
      <h2 className="text-lg font-semibold">
        {busy && !result
          ? "Checking payment status…"
          : result?.status === "verified"
            ? "Payment confirmed"
            : "Payment status"}
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">
        {busy && !result
          ? "Please wait while we confirm the transaction with Cashfree."
          : result?.status === "verified"
            ? "Your payment is recorded below."
            : result?.paid
              ? "Payment received. The office must review it. Do not pay again."
              : result?.retrySafe
                ? "The previous checkout has closed without a confirmed payment."
                : result?.attemptStatus === "failed"
                  ? "Cashfree reports this attempt failed. Check its status before paying again."
                  : result?.attemptStatus === "cancelled"
                    ? "Checkout was cancelled. If your account was debited, do not pay again until its status is checked."
                    : "This transaction is pending. If your account was debited, do not pay again until its status is checked."}
      </p>
      {error && <p className="mt-2 text-sm text-destructive">{error} If your account was debited, do not pay again.</p>}
      <div className="mt-4 flex flex-wrap gap-3">
        {!busy && result?.status !== "verified" && !result?.paid && (
          <Button variant="outline" disabled={busy} onClick={check}>
            {busy ? "Checking..." : "Check status"}
          </Button>
        )}
        {result?.retrySafe && (
          <Button asChild><Link href="/student/pay">Try payment again</Link></Button>
        )}
      </div>
    </Card>
  );
}
