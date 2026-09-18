"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowRight,
  Smartphone,
  Upload,
  ShieldCheck,
  CreditCard,
  CheckCircle2,
  ImagePlus,
  ArrowLeft,
} from "lucide-react";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { Input } from "./ui/input";
import { api, Feedback, Field, Spinner, useAction } from "./form-kit";
import { dateLabel, money } from "@/lib/money";
import { todayIndia } from "@/lib/validation";
import { load } from "@cashfreepayments/cashfree-js";

export type PayableFee = {
  id: string;
  label: string;
  dueDate: string;
  outstanding: number;
  pending?: { id: string; method: string };
};

export function Checkout({ dues }: { dues: PayableFee[] }) {
  const [selected, setSelected] = useState(dues[0]?.id ?? ""),
    [method, setMethod] = useState<"choose" | "manual">("choose"),
    [submitted, setSubmitted] = useState("");
  const [fileName, setFileName] = useState("");
  const [preview, setPreview] = useState("");
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const action = useAction(),
    router = useRouter();
    
  useEffect(() => {
    // Polling logic for pending verification (manual UPI) or after checkout finishes
    if (checkoutOpen) return;
    const timer = setInterval(() => router.refresh(), 15000);
    const refresh = () => router.refresh();
    window.addEventListener("focus", refresh);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
    };
  }, [router, checkoutOpen]);

  const fee = dues.find((f) => f.id === selected);
  if (submitted)
    return (
      <Card className="py-10 text-center">
        <CheckCircle2 className="mx-auto mb-4 size-12 text-primary" />
        <h2 className="text-2xl font-semibold">Screenshot received!</h2>
        <p className="my-4 text-sm text-muted-foreground">
          जाँच के बाद फीस अपडेट हो जाएगी।
          <br />
          The office will verify it. Please don’t pay again.
        </p>
        <Button asChild>
          <Link href={`/receipts/${submitted}`}>
            View payment
            <ArrowRight />
          </Link>
        </Button>
      </Card>
    );
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

  async function onlineCashfree() {
    // Use sandbox mode unconditionally as per requirements for now. 
    // In production, this would read from a NEXT_PUBLIC env var.
    const cashfree = await load({ mode: "sandbox" });
    
    setCheckoutOpen(true);
    let orderIdToVerify = "";
    
    try {
      const order = await api<{
        paymentSessionId: string;
        orderId: string;
      }>("/api/payments/order", { feeDueId: fee!.id });
      
      orderIdToVerify = order.orderId;

      await cashfree.checkout({
        paymentSessionId: order.paymentSessionId,
        redirectTarget: "_modal",
      });
      
      // When the modal closes, we verify the payment. 
      // If they abandoned it, verify route will error and we catch it below.
      action.run(async () => {
        const payment = await api<{ status: string; id: string }>(
          "/api/payments/verify",
          { order_id: orderIdToVerify },
        );
        router.push(`/receipts/${payment.id}`);
        router.refresh();
      });

    } catch (error: any) {
      // If checkout fails or is abandoned, cancel it
      if (orderIdToVerify) {
        try {
           await api<{ status: string }>("/api/payments/cancel", {
            orderId: orderIdToVerify,
          });
        } catch (cancelError) {
           console.error("Failed to cancel order:", cancelError);
        }
      }
      
      setMethod("choose");
      action.setSuccess(
        error?.message || "Payment was not completed. You can retry checkout."
      );
    } finally {
       setCheckoutOpen(false);
       router.refresh();
    }
  }

  const disabled = action.busy || checkoutOpen;
  return (
    <div className="space-y-5">
      {dues.length > 1 && (
        <Field label="Choose fee / फीस चुनें">
          <select
            value={selected}
            disabled={disabled}
            onChange={(e) => {
              setSelected(e.target.value);
              setMethod("choose");
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
      {fee.pending?.method === "manual_upi" ? (
        <Card>
          <h2 className="text-lg font-semibold">Verification pending</h2>
          <p className="my-4 text-sm leading-6 text-muted-foreground">
            Your screenshot is with the office. Please wait for verification.
          </p>
          <Button asChild variant="outline">
            <Link href={`/receipts/${fee.pending.id}`}>
              View payment
              <ArrowRight />
            </Link>
          </Button>
        </Card>
      ) : method === "choose" ? (
        <>
          <h2 className="pt-2 text-lg font-semibold">
            How would you like to pay?
          </h2>
          <button
            disabled={disabled}
            onClick={() => action.run(onlineCashfree)}
            className="flex min-h-28 w-full items-center gap-4 rounded-2xl border border-primary/30 bg-white p-5 text-left transition hover:bg-primary/5 disabled:opacity-50"
          >
            <span className="rounded-xl bg-[#e9f1e4] p-3 text-primary">
              <CreditCard className="size-6" />
            </span>
            <span className="flex-1">
              <span className="block font-semibold">
                {fee.pending ? "Continue online payment" : "Pay online"}
              </span>
              <span className="mt-1.5 block text-xs text-muted-foreground">
                UPI, Cards or Net Banking · Cashfree
              </span>
            </span>
            {disabled ? (
              <Spinner />
            ) : (
              <ArrowRight className="size-5 text-primary" />
            )}
          </button>
          {!fee.pending && (
            <button
              disabled={disabled}
              onClick={() => setMethod("manual")}
              className="flex min-h-28 w-full items-center gap-4 rounded-2xl border border-border bg-white p-5 text-left transition hover:bg-muted"
            >
              <span className="rounded-xl bg-[#f3efe5] p-3 text-[#947339]">
                <Smartphone className="size-6" />
              </span>
              <span className="flex-1">
                <span className="block font-semibold">
                  Already paid with UPI?
                </span>
                <span className="mt-1.5 block text-xs text-muted-foreground">
                  पहले ही भुगतान किया? Upload screenshot
                </span>
              </span>
              <ArrowRight className="size-5 text-muted-foreground" />
            </button>
          )}
          {fee.pending && (
            <Link
              href={`/receipts/${fee.pending.id}`}
              className="inline-flex min-h-12 items-center text-sm font-medium text-primary"
            >
              Money deducted? Check payment status →
            </Link>
          )}
        </>
      ) : (
        <Card>
          <button
            onClick={() => setMethod("choose")}
            className="mb-4 flex min-h-10 items-center gap-2 text-xs text-muted-foreground"
          >
            <ArrowLeft className="size-3.5" />
            Payment methods
          </button>
          <h2 className="text-xl font-semibold">Share your payment</h2>
          <p className="mb-6 mt-2 text-sm text-muted-foreground">
            भुगतान का स्क्रीनशॉट भेजें।
          </p>
          <form
            className="space-y-5"
            onSubmit={(e) => {
              e.preventDefault();
              const form = new FormData(e.currentTarget);
              form.set("feeDueId", fee.id);
              action.run(async () => {
                const result = await api<{ id: string }>(
                  "/api/payments/manual",
                  form,
                );
                setSubmitted(result.id);
                router.refresh();
              });
            }}
          >
            <Field label="Amount paid / दी गई रकम">
              <Input
                name="amount"
                inputMode="decimal"
                defaultValue={fee.outstanding / 100}
                required
                pattern="[0-9]+([.][0-9]{1,2})?"
              />
            </Field>
            <Field label="Payment date / तारीख">
              <Input
                name="paymentDate"
                type="date"
                max={todayIndia()}
                defaultValue={todayIndia()}
                required
              />
            </Field>
            <Field
              label="Payment screenshot"
              hint="JPG, PNG or WebP · Up to 3 MB"
            >
              <span className="relative flex min-h-28 flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border bg-muted/50 px-3 text-center">
                {preview ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={preview}
                    alt="Selected screenshot"
                    className="max-h-64 w-full rounded-lg object-contain"
                  />
                ) : (
                  <ImagePlus className="size-6 text-primary" />
                )}
                <span className="max-w-full break-all text-sm text-muted-foreground">
                  {fileName || "Tap to choose screenshot"}
                </span>
                <Input
                  className="absolute inset-0 h-full cursor-pointer opacity-0"
                  aria-label="Choose payment screenshot"
                  name="screenshot"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  required
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    setFileName(file?.name ?? "");
                    if (preview) URL.revokeObjectURL(preview);
                    setPreview(file ? URL.createObjectURL(file) : "");
                  }}
                />
              </span>
            </Field>
            <Button className="w-full" size="lg" pending={disabled} pendingText="Loading...">
              <Upload />Send for verification
            </Button>
          </form>
        </Card>
      )}
      <Feedback error={action.error} success={action.success} />
      <p className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
        <ShieldCheck className="size-4" />
        Safe payments. Private screenshots.
      </p>
    </div>
  );
}
