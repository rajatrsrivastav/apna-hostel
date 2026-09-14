"use client";
import { useRouter } from "next/navigation";
import { Check, X } from "lucide-react";
import { Button } from "./ui/button";
import { api, Feedback, Spinner, useAction } from "./form-kit";
export function AdmissionActions({
  id,
  status,
  revision,
}: {
  id: string;
  status: string;
  revision: number;
}) {
  const action = useAction(),
    router = useRouter();
  function decide(decision: string) {
    action.run(async () => {
      await api("/api/admin/admissions", { id, decision, revision });
      router.refresh();
    });
  }
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {status !== "accepted" && (
          <Button disabled={action.busy} onClick={() => decide("accepted")}>
            {action.busy ? <Spinner /> : <Check />}Accept student
          </Button>
        )}
        {status !== "rejected" && (
          <Button
            variant="destructive"
            disabled={action.busy}
            onClick={() => decide("rejected")}
          >
            <X />
            Reject
          </Button>
        )}
      </div>
      <Feedback error={action.error} />
    </div>
  );
}
