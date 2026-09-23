"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import Link from "next/link";
import { Check, Plus, Pencil, RefreshCw } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Card } from "./ui/card";
import { api, Field, Feedback, useAction } from "./form-kit";
import { money, dateLabel } from "@/lib/money";
import { StatusBadge } from "./ui/badge";
export function AddFee({ userId }: { userId: string }) {
  const [open, setOpen] = useState(false),
    action = useAction(),
    router = useRouter();
  return (
    <Card>
      {!open ? (
        <Button variant="outline" onClick={() => setOpen(true)}>
          <Plus />
          Add a fee
        </Button>
      ) : (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            const form = Object.fromEntries(new FormData(e.currentTarget));
            action.run(async () => {
              await api("/api/admin/fees", { ...form, userId });
              setOpen(false);
              router.refresh();
            });
          }}
        >
          <h2 className="font-semibold">Add a fee</h2>
          <Field label="Fee name">
            <Input
              name="label"
              placeholder="e.g. October hostel fee"
              required
              minLength={2}
              maxLength={80}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Amount (₹)">
              <Input name="amount" inputMode="decimal" required />
            </Field>
            <Field label="Due date">
              <Input name="dueDate" type="date" required />
            </Field>
          </div>
          <div className="flex gap-3">
            <Button pending={action.busy} pendingText="Loading...">
              <Plus />Save fee
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
    </Card>
  );
}
export type EditableFee = {
  rentMonth?: string | null;
  id: string;
  revision: number;
  label: string;
  amount: number;
  outstanding: number;
  paid: number;
  waivedAmount: number;
  dueDate: string;
  status: "paid" | "unpaid" | "pending";
  adjustmentNote: string | null;
  pending: boolean;
};
export function EditFee({ fee }: { fee: EditableFee }) {
  const [mode, setMode] = useState<"" | "update" | "paid" | "unpaid">(""),
    action = useAction(),
    router = useRouter();
  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold">{fee.label}</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Due {dateLabel(fee.dueDate)}
          </p>
        </div>
        <StatusBadge status={fee.status} />
      </div>
      <div className="my-5 grid grid-cols-3 gap-2 text-sm">
        {[
          ["Fee", fee.amount],
          ["Paid", fee.paid],
          ["Remaining", fee.outstanding],
        ].map(([label, value]) => (
          <div key={label}>
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="mt-1 font-semibold">{money(Number(value))}</p>
          </div>
        ))}
      </div>
      {fee.waivedAmount > 0 && (
        <p className="mb-4 rounded-lg bg-muted p-3 text-xs">
          Manual adjustment: {money(fee.waivedAmount)} · {fee.adjustmentNote}
        </p>
      )}
      {fee.pending ? (
        <p className="text-xs text-amber-800">
          Resolve the pending payment before editing this fee.
        </p>
      ) : !mode ? (
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => setMode("update")}>
            <Pencil />
            Edit fee
          </Button>
          {fee.outstanding > 0 && (
            <Button variant="ghost" size="sm" onClick={() => setMode("paid")}>
              <Check />
              Waive remaining fee
            </Button>
          )}
          {fee.waivedAmount > 0 && (
            <Button variant="ghost" size="sm" onClick={() => setMode("unpaid")}>
              Undo waiver
            </Button>
          )}
        </div>
      ) : (
        <form
          className="space-y-4 border-t border-border pt-4"
          onSubmit={(e) => {
            e.preventDefault();
            const form = Object.fromEntries(new FormData(e.currentTarget));
            action.run(async () => {
              await api(
                "/api/admin/fees",
                { ...form, id: fee.id, revision: fee.revision, action: mode },
                "PATCH",
              );
              setMode("");
              router.refresh();
            });
          }}
        >
          <p className="text-sm font-semibold">
            {mode === "update"
              ? "Update fee"
              : mode === "paid"
                ? "Waive remaining fee"
                : "Undo manual paid adjustment"}
          </p>
          {mode === "update" ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Total fee (₹)">
                <Input
                  name="amount"
                  defaultValue={fee.amount / 100}
                  inputMode="decimal"
                  required
                />
              </Field>
              <Field label="Due date">
                <Input
                  name="dueDate"
                  type="date"
                  defaultValue={fee.dueDate}
                  required
                />
              </Field>
            </div>
          ) : (
            <p className="text-xs leading-5 text-muted-foreground">
              {mode === "paid"
                ? "This clears the remaining fee as an admin adjustment. It does not record money collected."
                : "This restores the amount cleared by an admin. Verified payments remain in the history."}
            </p>
          )}
          <Field label="Reason">
            <Input
              name="note"
              placeholder="Short reason for this change"
              minLength={3}
              maxLength={300}
              required
            />
          </Field>
          <div className="flex gap-2">
            <Button pending={action.busy} pendingText="Loading...">
              <Check />Confirm
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={action.busy}
              onClick={() => setMode("")}
            >
              Cancel
            </Button>
          </div>
        </form>
      )}
      <Feedback error={action.error} />
    </Card>
  );
}
export function Reconcile({ id, canRetry = false }: { id: string; canRetry?: boolean }) {
  const [retrySafe, setRetrySafe] = useState(false);
  const action = useAction(),
    router = useRouter();
  return (
    <div className="space-y-3">
      <Button
        variant="outline"
        pending={action.busy}
        pendingText="Loading..."
        onClick={() =>
          action.run(async () => {
            const r = await api<{ status: string; message?: string; retrySafe: boolean }>(
              "/api/payments/reconcile",
              { paymentId: id },
            );
            setRetrySafe(r.retrySafe);
            action.setSuccess(
              r.status === "verified"
                ? "Payment verified."
                : r.message || "Payment is still processing.",
            );
            router.refresh();
          })
        }
      >
        <RefreshCw />Check status
      </Button>
      {canRetry && retrySafe && (
        <Button asChild><Link href="/student/pay">Try payment again</Link></Button>
      )}
      <Feedback error={action.error} success={action.success} />
    </div>
  );
}
export function PrintReceipt() {
  return (
    <Button
      className="no-print"
      variant="outline"
      onClick={() => window.print()}
    >
      Print / Save receipt
    </Button>
  );
}

export function MonthlyRent({
  userId,
  amount,
}: {
  userId: string;
  amount: number;
}) {
  const action = useAction(),
    router = useRouter();
  return (
    <Card>
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          const form = Object.fromEntries(new FormData(event.currentTarget));
          action.run(async () => {
            await api(
              "/api/admin/fees",
              {
                ...form,
                action: "monthlyRent",
                userId,
                previousAmount: amount,
              },
              "PATCH",
            );
            action.setSuccess("Monthly fee saved.");
            router.refresh();
          });
        }}
      >
        <Field label="Monthly fee (₹)">
          <Input
            name="amount"
            defaultValue={amount / 100}
            inputMode="decimal"
            required
          />
        </Field>
        <p className="text-xs text-muted-foreground">
          Applies to future months. Use Edit fee below to change an existing
          month.
        </p>
        <Button pending={action.busy} pendingText="Loading...">
          <Pencil />Save monthly fee
        </Button>
      </form>
      <Feedback error={action.error} success={action.success} />
    </Card>
  );
}
