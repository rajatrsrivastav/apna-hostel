"use client";
import { useState } from "react";
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
type CheckoutResult = {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
};
type RazorpayOptions = {
  key: string;
  order_id: string;
  amount: number;
  currency: string;
  name: string;
  description: string;
  prefill: { name: string; email: string; contact: string };
  theme: { color: string };
  handler: (result: CheckoutResult) => void;
  modal: { ondismiss: () => void };
};
declare global {
  interface Window {
    Razorpay?: new (options: RazorpayOptions) => {
      open: () => void;
      on: (event: string, callback: () => void) => void;
    };
  }
}
let scriptPromise: Promise<void> | undefined;
async function loadCheckout() {
  if (window.Razorpay) return;
  if (!scriptPromise)
    scriptPromise = new Promise<void>((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://checkout.razorpay.com/v1/checkout.js";
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => {
        script.remove();
        scriptPromise = undefined;
        reject(
          new Error("Could not load payment window. Check your connection."),
        );
      };
      document.body.appendChild(script);
    });
  await scriptPromise;
}
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
    [submitted, setSubmitted] = useState(""),
    [checkoutOpen, setCheckoutOpen] = useState(false);
  const [fileName, setFileName] = useState("");
  const action = useAction(),
    router = useRouter();
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
  async function online() {
    await loadCheckout();
    const order = await api<{
      key: string;
      orderId: string;
      amount: number;
      name: string;
      email: string;
      phone: string;
    }>("/api/payments/order", { feeDueId: fee!.id });
    if (!window.Razorpay)
      throw new Error("Payment window is unavailable. Please reload.");
    const checkout = new window.Razorpay({
      key: order.key,
      order_id: order.orderId,
      amount: order.amount,
      currency: "INR",
      name: "Apna Hostel",
      description: fee!.label,
      prefill: { name: order.name, email: order.email, contact: order.phone },
      theme: { color: "#28654c" },
      handler: (result) => {
        setCheckoutOpen(false);
        action.run(async () => {
          const payment = await api<{ status: string; id: string }>(
            "/api/payments/verify",
            result,
          );
          router.push(`/receipts/${payment.id}`);
          router.refresh();
        });
      },
      modal: {
        ondismiss: () => {
          setCheckoutOpen(false);
          router.refresh();
        },
      },
    });
    checkout.on("payment.failed", () => {
      action.setSuccess(
        "Payment was not completed. You can retry checkout. If money was deducted, check Payments first.",
      );
    });
    setCheckoutOpen(true);
    checkout.open();
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
            onClick={() => action.run(online)}
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
                UPI, card or net banking · Razorpay
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
                <ImagePlus className="size-6 text-primary" />
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
                  onChange={(e) => setFileName(e.target.files?.[0]?.name ?? "")}
                />
              </span>
            </Field>
            <Button className="w-full" size="lg" disabled={disabled}>
              {action.busy ? <Spinner /> : <Upload />}Send for verification
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
