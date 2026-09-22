"use client";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { CheckCircle2, XCircle, Loader2, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { api } from "@/components/form-kit";

type Status = "verifying" | "success" | "failed" | "pending" | "review";

export function PaymentStatusClient() {
  const searchParams = useSearchParams();
  const orderId = searchParams.get("order_id");

  const [status, setStatus] = useState<Status>(() =>
    orderId ? "verifying" : "failed",
  );
  const [retry, setRetry] = useState(0);
  const [paymentId, setPaymentId] = useState("");
  const [errorMsg, setErrorMsg] = useState(() =>
    orderId ? "" : "No order ID found. Please return to payments.",
  );

  useEffect(() => {
    if (!orderId) return;

    let cancelled = false;

    let timer: ReturnType<typeof setTimeout> | undefined;
    let attempts = 0;
    async function verify() {
      try {
        const result = await api<{
          status: string;
          id: string;
          paid: boolean;
          message: string;
        }>("/api/payments/verify", { order_id: orderId });
        if (cancelled) return;
        setPaymentId(result.id);
        if (result.status === "verified") {
          setStatus("success");
          return;
        }
        if (result.paid) {
          setErrorMsg(result.message);
          setStatus("review");
          return;
        }
        if (++attempts < 5) {
          timer = setTimeout(verify, 3000);
          return;
        }
        setErrorMsg(result.message);
        setStatus("pending");
      } catch (err: unknown) {
        if (cancelled) return;
        setErrorMsg(
          err instanceof Error
            ? err.message
            : "Could not verify payment. Please check again.",
        );
        setStatus("pending");
      }
    }
    verify();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [orderId, retry]);

  if (status === "pending" || status === "review") {
    return (
      <Card className="py-12 text-center">
        <h2 className="text-xl font-semibold">
          {status === "review"
            ? "Payment received — review required"
            : "Payment not confirmed yet"}
        </h2>
        <p className="my-4 text-sm text-muted-foreground">
          {errorMsg} If your account was debited, please do not pay again.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          {status === "pending" && (
            <Button
              onClick={() => {
                setStatus("verifying");
                setRetry((value) => value + 1);
              }}
            >
              Check payment status
            </Button>
          )}
          {paymentId && (
            <Button asChild variant="outline">
              <Link href={`/receipts/${paymentId}`}>View payment</Link>
            </Button>
          )}
          <Button asChild variant="outline">
            <Link href="/student">Back to my fee</Link>
          </Button>
        </div>
      </Card>
    );
  }

  if (status === "verifying") {
    return (
      <Card className="py-12 text-center">
        <Loader2 className="mx-auto mb-4 size-10 animate-spin text-primary" />
        <h2 className="text-xl font-semibold">Verifying your payment…</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          कृपया प्रतीक्षा करें · Please wait while we confirm.
        </p>
      </Card>
    );
  }

  if (status === "success") {
    return (
      <Card className="py-12 text-center">
        <CheckCircle2 className="mx-auto mb-4 size-12 text-primary" />
        <h2 className="text-2xl font-semibold">Payment successful!</h2>
        <p className="my-4 text-sm text-muted-foreground">
          भुगतान सफल · Your fee has been updated.
        </p>
        <div className="flex items-center justify-center gap-3">
          <Button asChild>
            <Link href={`/receipts/${paymentId}`}>
              View receipt
              <ArrowRight />
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/student">Back to my fee</Link>
          </Button>
        </div>
      </Card>
    );
  }

  // status === "failed"
  return (
    <Card className="py-12 text-center">
      <XCircle className="mx-auto mb-4 size-12 text-destructive" />
      <h2 className="text-xl font-semibold">Payment not completed</h2>
      <p className="my-4 text-sm text-muted-foreground">
        {errorMsg || "The payment could not be verified."}
      </p>
      <div className="flex items-center justify-center gap-3">
        <Button asChild>
          <Link href="/student/pay">Try again</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/student">Back to my fee</Link>
        </Button>
      </div>
    </Card>
  );
}
