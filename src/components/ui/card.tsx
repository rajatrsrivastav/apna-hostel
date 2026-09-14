import { cn } from "@/lib/utils";
export function Card({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card"
      className={cn(
        "rounded-2xl border border-border bg-white p-5 shadow-[0_2px_5px_0_rgb(0_0_0/0.015)] sm:p-6",
        className,
      )}
      {...props}
    />
  );
}
