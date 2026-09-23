"use client";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { CheckCircle2, XCircle, Loader2, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { api } from "@/components/form-kit";

type Status = "verifying" | "success" | "failed" | "review";

export function PaymentStatusClient() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const orderId = searchParams.get("order_id");

  const [status, setStatus] = useState<Status>(() =>
    orderId ? "verifying" : "failed",
  );
  const [paymentId, setPaymentId] = useState("");
  const [errorMsg, setErrorMsg] = useState(() =>
    orderId ? "" : "No order ID found. Please return to payments.",
  );

  useEffect(() => {
    if (!orderId) return;

    let cancelled = false;

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
        router.replace(`/student/history?order_id=${encodeURIComponent(orderId!)}`);
      } catch (err: unknown) {
        if (cancelled) return;
        setErrorMsg(
          err instanceof Error
            ? err.message
            : "Could not verify payment. Please check again.",
        );
        router.replace(`/student/history?order_id=${encodeURIComponent(orderId!)}`);
      }
    }
    verify();
    return () => {
      cancelled = true;
    };
  }, [orderId, router]);

  if (status === "review") {
    return (
      <Card className="py-12 text-center">
        <h2 className="text-xl font-semibold">Payment received — review required</h2>
        <p className="my-4 text-sm text-muted-foreground">{errorMsg} Please do not pay again.</p>
        <Button asChild variant="outline">
          <Link href={paymentId ? `/receipts/${paymentId}` : "/student/history"}>View payment</Link>
        </Button>
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
