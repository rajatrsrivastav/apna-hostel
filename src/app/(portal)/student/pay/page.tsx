import { studentPage } from "@/lib/access";
import { studentData } from "@/lib/data";
import { Checkout } from "@/components/checkout";
export default async function Pay() {
  const { user } = await studentPage();
  const { dues } = await studentData(user.id);
  return (
    <div className="mx-auto max-w-xl">
      <h1 className="text-3xl font-semibold tracking-tight">Pay your fee</h1>
      <p className="mb-7 mt-2 text-sm text-muted-foreground">
        फीस भरें · Just a few taps.
      </p>
      <Checkout
        dues={dues
          .filter((f) => f.outstanding > 0)
          .map((f) => ({
            id: f.id,
            label: f.label,
            outstanding: f.outstanding,
            dueDate: f.dueDate,
            pending: f.pending
              ? { id: f.pending.id, method: f.pending.method }
              : undefined,
          }))}
      />
    </div>
  );
}
