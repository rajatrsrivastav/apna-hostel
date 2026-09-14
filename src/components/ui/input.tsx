import { cn } from "@/lib/utils";
export function Input({ className, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      data-slot="input"
      className={cn(
        "min-h-12 w-full min-w-0 rounded-xl border border-border bg-white px-4 py-3 text-base outline-none placeholder:text-muted-foreground/70 focus:border-primary focus:ring-2 focus:ring-primary/15 disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}
