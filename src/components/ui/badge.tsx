import { Check, Clock3, CircleAlert, X } from "lucide-react";
import { cn } from "@/lib/utils";
const variants = {
  paid: ["bg-emerald-50 text-emerald-800", "Paid", Check],
  verified: ["bg-emerald-50 text-emerald-800", "Paid", Check],
  unpaid: ["bg-red-50 text-red-700", "Unpaid", CircleAlert],
  pending: ["bg-amber-50 text-amber-800", "Pending", Clock3],
  checkout_started: ["bg-blue-50 text-blue-800", "Pending", Clock3],
  cancelled: ["bg-red-50 text-red-700", "Cancelled", X],
  abandoned: ["bg-red-50 text-red-700", "Cancelled", Clock3],
  processing: ["bg-blue-50 text-blue-800", "Pending", Clock3],
  rejected: ["bg-red-50 text-red-700", "Rejected", X],
  failed: ["bg-red-50 text-red-700", "Failed", X],
} as const;
export function StatusBadge({
  status,
  className,
}: {
  status: keyof typeof variants;
  className?: string;
}) {
  const [color, label, Icon] = variants[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold",
        color,
        className,
      )}
    >
      <Icon className="size-3.5" />
      {label}
    </span>
  );
}
