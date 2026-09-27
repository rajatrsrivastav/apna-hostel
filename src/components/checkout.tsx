"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowRight,
  ShieldCheck,
  CreditCard,
  CheckCircle2,
} from "lucide-react";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { Feedback, Field, Spinner } from "./form-kit";
import { dateLabel, money } from "@/lib/money";
import { prepareCheckout, watchCheckoutReturn } from "@/lib/checkout-session";

export type PayableFee = {
  id: string;
  label: string;
  dueDate: string;
  outstanding: number;
  pending?: { id: string; method: string };
};

export function Checkout({
  dues,
  compact = false,
}: {
  dues: PayableFee[];
  compact?: boolean;
}) {
  const [selected, setSelected] = useState(dues[0]?.id ?? "");
  const [isLoading, setIsLoading] = useState(false);
  const [payError, setPayError] = useState("");
  const [payNotice, setPayNotice] = useState("");
  const activeRequest = useRef<AbortController | null>(null);
  const paymentLock = useRef(false);
  const router = useRouter();

  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, 60000);
    const stopWatching = watchCheckoutReturn(
      window,
      () => router.refresh(),
      () => {
        activeRequest.current?.abort();
        paymentLock.current = false;
        setIsLoading(false);
        setPayNotice("");
      },
    );
    return () => {
      clearInterval(timer);
      stopWatching();
      activeRequest.current?.abort();
    };
  }, [router]);

  const fee = dues.find((f) => f.id === selected);
  if (!fee)
    return (
      <Card className="text-center">
        <CheckCircle2 className="mx-auto mb-3 size-10 text-primary" />
        <h2 className="text-xl font-semibold">All sorted!</h2>
        <p className="my-4 text-sm text-muted-foreground">
          You have no fee to pay right now.
        </p>
        <Button asChild variant="outline">
          <Link href="/student">Back to my fee</Link>
        </Button>
      </Card>
    );

  async function handlePayment() {
    if (paymentLock.current) return;
    paymentLock.current = true;
    setIsLoading(true);
    setPayError("");
    setPayNotice("");
    const controller = new AbortController();
    activeRequest.current = controller;
    let checkoutOrderId: string | null = null;

    try {
      const data = await prepareCheckout(
        fee!.id,
        controller.signal,
        setPayNotice,
      );
      if (data.state) {
        setPayNotice(
          data.state === "closing"
            ? "Cashfree is still closing the previous checkout. Tap Pay Now to check again."
            : "Your bank payment is awaiting confirmation. Tap Pay Now to check its status.",
        );
        return;
      }
      setPayNotice("");
      const orderId = data.orderId;
      if (typeof orderId !== "string" || !orderId)
        throw new Error("Could not start checkout. Please try again.");

      if (data.alreadyPaid) {
        router.replace(
          `/student/history?order_id=${encodeURIComponent(orderId)}`,
        );
        return;
      }
      const paymentSessionId = data?.payment_session_id;
      if (typeof paymentSessionId !== "string" || !paymentSessionId) {
        throw new Error("Could not start checkout. Please try again.");
      }
      checkoutOrderId = orderId;
      const { load } = await import("@cashfreepayments/cashfree-js");
      const cashfree = await load({ mode: "production" });
      if (!cashfree)
        throw new Error("Payment gateway could not load. Please try again.");
      const result = await cashfree.checkout({
        paymentSessionId,
        redirectTarget: "_modal",
      });
      // Cashfree owns external bank redirects. A returned result (including a
      // dismissed modal) goes to Payments for authoritative server verification.
      if (controller.signal.aborted || result?.redirect) return;
      await fetch("/api/payments/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId }),
        signal: AbortSignal.timeout(15000),
      }).catch(() => undefined);
      router.replace(
        `/student/history?order_id=${encodeURIComponent(orderId)}`,
      );
    } catch (error: unknown) {
      if (controller.signal.aborted) return;
      setPayNotice("");
      if (checkoutOrderId) {
        await fetch("/api/payments/cancel", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orderId: checkoutOrderId }),
          signal: AbortSignal.timeout(15000),
        }).catch(() => undefined);
        router.replace(
          `/student/history?order_id=${encodeURIComponent(checkoutOrderId)}`,
        );
        return;
      }
      const message = error instanceof Error ? error.message : String(error);
      setPayError(message || "Payment was not completed. You can try again.");
    } finally {
      if (activeRequest.current === controller) {
        paymentLock.current = false;
        setIsLoading(false);
      }
    }
  }

  const disabled = isLoading;
  if (compact) {
    return (
      <div>
        <Button
          size="lg"
          className="w-full justify-between"
          pending={disabled}
          pendingText="Starting payment..."
          onClick={handlePayment}
        >
          Pay Now / फीस भरें
          <ArrowRight className="ml-auto" />
        </Button>
        <Feedback error={payError} />
        {payNotice && (
          <p role="status" className="mt-3 text-sm text-muted-foreground">
            {payNotice}
          </p>
        )}
      </div>
    );
  }
  return (
    <div className="space-y-5">
      {dues.length > 1 && (
        <Field label="Choose fee / फीस चुनें">
          <select
            value={selected}
            disabled={disabled}
            onChange={(e) => {
              setSelected(e.target.value);
            }}
          >
            {dues.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label} · {money(f.outstanding)}
              </option>
            ))}
          </select>
        </Field>
      )}
      <div className="flex items-center justify-between gap-3 rounded-2xl border border-[#d9e4d4] bg-[#edf3e7] p-5">
        <div>
          <p className="text-sm font-medium">{fee.label}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Due {dateLabel(fee.dueDate)}
          </p>
        </div>
        <span className="text-2xl font-semibold tracking-tight">
          {money(fee.outstanding)}
        </span>
      </div>
      <>
        <h2 className="pt-2 text-lg font-semibold">Pay your fee</h2>
        <button
          disabled={disabled}
          onClick={handlePayment}
          className="flex min-h-28 w-full items-center gap-4 rounded-2xl border border-primary/30 bg-white p-5 text-left transition hover:bg-primary/5 disabled:opacity-50"
        >
          <span className="rounded-xl bg-[#e9f1e4] p-3 text-primary">
            <CreditCard className="size-6" />
          </span>
          <span className="flex-1">
            <span className="block font-semibold">
              {isLoading ? "Initializing..." : "Pay online"}
            </span>
            <span className="mt-1.5 block text-xs text-muted-foreground">
              UPI, Cards or Net Banking · Cashfree
            </span>
          </span>
          {isLoading ? (
            <Spinner />
          ) : (
            <ArrowRight className="size-5 text-primary" />
          )}
        </button>
      </>
      <Feedback error={payError} />
      {payNotice && (
        <p role="status" className="text-sm text-muted-foreground">
          {payNotice}
        </p>
      )}
      <p className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
        <ShieldCheck className="size-4" />
        Safe payments via Cashfree.
      </p>
    </div>
  );
}
