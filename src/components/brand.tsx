import { House } from "lucide-react";
export function Brand({ light = false }: { light?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <span
        className={`flex size-10 items-center justify-center rounded-xl ${light ? "bg-white/15 text-white" : "bg-primary text-white"}`}
      >
        <House className="size-5" strokeWidth={1.7} />
      </span>
      <span>
        <span className="block text-lg font-bold tracking-tight">
          apna<span className="font-normal">hostel</span>
          <span className="text-[#dc9a53]">.</span>
        </span>
        <span
          className={`block text-[9px] font-semibold tracking-[0.21em] ${light ? "text-white/65" : "text-muted-foreground"}`}
        >
          A LITTLE MORE LIKE HOME
        </span>
      </span>
    </div>
  );
}
