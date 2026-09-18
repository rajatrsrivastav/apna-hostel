"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { api, Field, Feedback, useAction } from "./form-kit";
import { todayIndia } from "@/lib/validation";
export function AdminCollection({
  feeDueId,
  outstanding,
  payment,
}: {
  feeDueId: string;
  outstanding: number;
  payment?: {
    id: string;
    amount: number;
    paymentDate: string | null;
    revision: number;
    status: string;
  };
}) {
  const [open, setOpen] = useState(false),
    [requestId, setRequestId] = useState(""),
    action = useAction(),
    router = useRouter();
  return (
    <div className="space-y-3 rounded-xl border border-border bg-white p-4">
      {!open ? (
        <Button
          variant="outline"
          onClick={() => {
            setRequestId(crypto.randomUUID());
            setOpen(true);
          }}
        >
          {payment ? "Edit collected amount" : "Record payment / Mark paid"}
        </Button>
      ) : (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            const values = Object.fromEntries(new FormData(e.currentTarget));
            action.run(async () => {
              await api(
                "/api/admin/collections",
                {
                  ...values,
                  id: payment?.id || requestId,
                  feeDueId,
                  ...(payment ? { revision: payment.revision } : {}),
                },
                payment ? "PATCH" : "POST",
              );
              setOpen(false);
              router.refresh();
            });
          }}
        >
          <p className="text-sm font-semibold">
            {payment ? "Correct admin collection" : "Money collected by admin"}
          </p>
          <Field
            label="Amount collected (₹)"
            hint={
              payment
                ? "Enter 0 to void this collection. The history is retained."
                : undefined
            }
          >
            <Input
              name="amount"
              inputMode="decimal"
              defaultValue={
                payment
                  ? payment.status === "verified"
                    ? payment.amount / 100
                    : 0
                  : outstanding / 100
              }
              required
            />
          </Field>
          <Field label="Payment date">
            <Input
              name="paymentDate"
              type="date"
              defaultValue={payment?.paymentDate || todayIndia()}
              max={todayIndia()}
              required
            />
          </Field>
          <Field label="Reason / Reference">
            <Input
              name="note"
              minLength={3}
              maxLength={300}
              required
              placeholder="e.g. Cash received at office"
            />
          </Field>
          <div className="flex gap-2">
            <Button pending={action.busy} pendingText="Loading...">
              Save collection
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={action.busy}
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
          </div>
        </form>
      )}
      <Feedback error={action.error} />
    </div>
  );
}
