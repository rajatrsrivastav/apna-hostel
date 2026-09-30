"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { Input } from "./ui/input";
import { Field, Feedback, api, useAction } from "./form-kit";
import { academicYearLabel } from "@/lib/academic-year";

function RenewalChoice({ defaultValue = true }: { defaultValue?: boolean }) {
  return (
    <Field label="After this academic year">
      <select name="renewal" defaultValue={String(defaultValue)} required>
        <option value="true">
          Keep student — monthly fee resumes in August
        </option>
        <option value="false">
          Student leaves — stop rent after July, retain history
        </option>
      </select>
    </Field>
  );
}
export function AcademicYearForm({
  userId,
  startYear,
  feeId,
  feeRevision,
  onCancel,
}: {
  userId: string;
  startYear: number;
  feeId?: string;
  feeRevision?: number;
  onCancel: () => void;
}) {
  const action = useAction(),
    router = useRouter();
  return (
    <form
      className="space-y-4 border-t border-border pt-4"
      onSubmit={(e) => {
        e.preventDefault();
        const form = new FormData(e.currentTarget);
        action.run(async () => {
          await api("/api/admin/year-coverage", {
            userId,
            startYear: Number(form.get("year")),
            continueNextYear: form.get("renewal") === "true",
            note: form.get("note"),
            feeId,
            feeRevision,
          });
          onCancel();
          router.refresh();
        });
      }}
    >
      <h3 className="font-semibold">Paid for the whole academic year</h3>
      <p className="text-sm text-muted-foreground">
        Use this for a full-year payment already received outside this portal.
        Covered rent dues are cleared through July; other years and extra fees
        remain due. This record does not add money to collection totals.
      </p>
      <Field label="Academic year">
        <select name="year" defaultValue={startYear} required>
          {Array.from({ length: startYear - 2026 + 2 }, (_, i) => 2026 + i).map(
            (y) => (
              <option value={y} key={y}>
                {academicYearLabel(y)}
              </option>
            ),
          )}
        </select>
      </Field>
      <RenewalChoice />
      <Field label="Receipt reference / payment details">
        <Input
          name="note"
          minLength={3}
          maxLength={300}
          required
          placeholder="Receipt number, payment date and amount"
        />
      </Field>
      <div className="flex flex-wrap gap-2">
        <Button pending={action.busy}>Confirm year payment</Button>
        <Button
          type="button"
          variant="ghost"
          disabled={action.busy}
          onClick={onCancel}
        >
          Cancel
        </Button>
      </div>
      <Feedback error={action.error} />
    </form>
  );
}
type Coverage = {
  id: string;
  startMonth: string;
  endMonth: string;
  continueNextYear: boolean;
  note: string;
  revision: number;
  revokedAt: string | null;
  audit: { action: string; note: string; at: string; actor: string }[];
};
function CoverageEntry({
  record: c,
  userId,
}: {
  record: Coverage;
  userId: string;
}) {
  const [mode, setMode] = useState<"" | "renewal" | "revoke">("");
  const action = useAction(),
    router = useRouter();
  return (
    <div className="space-y-3 rounded-xl border border-border p-4">
      <p className="font-semibold">
        {academicYearLabel(Number(c.startMonth.slice(0, 4)))}{" "}
        {c.revokedAt ? "· Removed" : "· Year paid"}
      </p>
      <p className="text-sm">
        {c.continueNextYear
          ? `Monthly rent resumes August ${Number(c.endMonth.slice(0, 4))}.`
          : "Student leaves after July. Future rent stops; account and history are retained."}
      </p>
      <p className="text-xs text-muted-foreground">{c.note}</p>
      {!c.revokedAt && !mode && (
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setMode("renewal")}
          >
            Change August choice
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setMode("revoke")}>
            Undo year payment
          </Button>
        </div>
      )}
      {mode && (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            const form = new FormData(e.currentTarget);
            action.run(async () => {
              await api(
                "/api/admin/year-coverage",
                {
                  userId,
                  id: c.id,
                  revision: c.revision,
                  action: mode,
                  note: form.get("note"),
                  ...(mode === "renewal"
                    ? { continueNextYear: form.get("renewal") === "true" }
                    : {}),
                },
                "PATCH",
              );
              setMode("");
              router.refresh();
            });
          }}
        >
          {mode === "renewal" ? (
            <RenewalChoice defaultValue={c.continueNextYear} />
          ) : (
            <p className="text-sm">
              Undo restores accrued rent and the remaining fees cleared by this
              year payment. Verified payments remain recorded.
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            Resuming rent after August also creates any monthly dues already
            accrued since August.
          </p>
          <Field label="Reason">
            <Input name="note" minLength={3} maxLength={300} required />
          </Field>
          <Button pending={action.busy}>Confirm change</Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => setMode("")}
            disabled={action.busy}
          >
            Cancel
          </Button>
        </form>
      )}
      <Feedback error={action.error} />
      <details className="text-xs">
        <summary className="cursor-pointer">Change history</summary>
        {c.audit.map((a, i) => (
          <p key={i} className="mt-2">
            {a.at.slice(0, 10)} · {a.action} · {a.note} · Admin {a.actor}
          </p>
        ))}
      </details>
    </div>
  );
}
export function YearCoverageManager({
  userId,
  startYear,
  records,
}: {
  userId: string;
  startYear: number;
  records: Coverage[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <Card className="space-y-4">
      <h2 className="font-semibold">Academic year payments</h2>
      <p className="text-sm text-muted-foreground">
        Rent coverage runs August to July. Record each paid year separately,
        including renewals.
      </p>
      {records.map((c) => (
        <CoverageEntry
          key={`${c.id}-${c.revision}`}
          record={c}
          userId={userId}
        />
      ))}
      {open ? (
        <AcademicYearForm
          userId={userId}
          startYear={startYear}
          onCancel={() => setOpen(false)}
        />
      ) : (
        <Button variant="outline" onClick={() => setOpen(true)}>
          Record full-year payment
        </Button>
      )}
    </Card>
  );
}
