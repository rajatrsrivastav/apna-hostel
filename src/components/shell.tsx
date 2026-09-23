"use client";
import { MerchantLegal } from "@/components/merchant-legal";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  History,
  CircleHelp,
  LogOut,
  ArrowUpRight,
  ShieldCheck,
  House,
} from "lucide-react";
import { Brand } from "./brand";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";
import { useAction, Feedback, Spinner } from "./form-kit";
const adminNav = [
  { href: "/admin", label: "Overview", icon: LayoutDashboard },
  { href: "/admin/pending", label: "Pending students", icon: Users },
  { href: "/admin/students", label: "Students", icon: Users },
];
const studentNav = [
  { href: "/dashboard", label: "My fee", icon: House },
  { href: "/student/history", label: "Payments", icon: History },
  { href: "/student/help", label: "Help", icon: CircleHelp },
];
export function Shell({
  children,
  user,
}: {
  children: React.ReactNode;
  user: { name: string; role: string };
}) {
  const path = usePathname(),
    router = useRouter(),
    action = useAction();
  const admin = user.role === "admin";
  const nav = admin ? adminNav : studentNav;
  const links = (mobile = false) =>
    nav.map(({ href, label, icon: Icon }) => {
      const active =
        path === href || (href !== nav[0].href && path.startsWith(href));
      return (
        <Link
          key={href}
          href={href}
          aria-current={active ? "page" : undefined}
          className={cn(
            "flex min-h-12 items-center gap-3 rounded-xl px-4 text-sm font-medium transition-colors",
            active
              ? "bg-[#e7eee2] text-primary"
              : "text-muted-foreground hover:bg-muted",
            mobile &&
              "flex-1 flex-col gap-1 rounded-none px-1 py-2 text-[10px]",
          )}
        >
          <Icon className="size-[18px]" strokeWidth={1.7} />
          {label}
          {active && !mobile && (
            <span className="ml-auto size-1.5 rounded-full bg-primary" />
          )}
        </Link>
      );
    });
  return (
    <div className="min-h-dvh">
      <aside className="no-print fixed inset-y-0 left-0 z-20 hidden w-60 flex-col border-r border-border bg-[#fbfcf9] p-6 lg:flex">
        <Link href={nav[0].href}>
          <Brand />
        </Link>
        <p className="mb-4 mt-12 px-4 text-[10px] font-semibold tracking-[0.16em] text-muted-foreground">
          {admin ? "HOSTEL MANAGEMENT" : "YOUR HOSTEL"}
        </p>
        <nav className="space-y-2">{links()}</nav>
        <div className="mt-auto">
          <div className="mb-6 rounded-2xl border border-[#e1e6d8] bg-[#f1f4e9] p-4">
            <span className="text-lg text-primary">✦</span>
            <p className="mt-2 text-sm font-semibold">
              {admin
                ? "A little care goes a long way."
                : "Focus on your future."}
            </p>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">
              {admin
                ? "Keep fees organised. Keep student life simple."
                : "Your hostel fee, all in one place."}
            </p>
          </div>
          <div className="flex items-center gap-3 border-t border-border pt-5">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[#e5eadd] text-sm font-semibold">
              {user.name[0]?.toUpperCase()}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{user.name}</p>
              <p className="text-[11px] text-muted-foreground">
                {admin ? "Hostel admin" : "Student"}
              </p>
            </div>
            <button
              title="Sign out"
              aria-label="Sign out"
              disabled={action.busy}
              className="ml-auto flex size-11 shrink-0 items-center justify-center"
              onClick={() =>
                action.run(async () => {
                  const result = await authClient.signOut();
                  if (result.error)
                    throw new Error(
                      result.error.message ||
                        "Logout failed. Please try again.",
                    );
                  router.replace("/login");
                  router.refresh();
                })
              }
            >
              {action.busy ? <Spinner /> : <LogOut className="size-4 text-muted-foreground" />}
            </button>
          </div>
          <Feedback error={action.error} />
        </div>
      </aside>
      <div className="lg:ml-60">
        <header className="no-print flex h-20 items-center justify-between gap-4 border-b border-border bg-white/70 px-5 sm:px-8 lg:px-10">
          <div className="lg:hidden">
            <Brand />
          </div>
          <span className="hidden text-sm text-muted-foreground lg:block">
            {admin ? "A clearer view. A calmer day." : "Good to have you here."}
          </span>
          <span className="hidden items-center gap-2 rounded-full border border-border bg-white px-3 py-1.5 text-xs text-muted-foreground sm:flex">
            <span className="size-1.5 rounded-full bg-primary" />
            {admin ? "Admin workspace" : "Student portal"}
          </span>
          <button
            className="flex size-12 items-center justify-center lg:hidden"
            aria-label="Sign out"
            disabled={action.busy}
            onClick={() =>
              action.run(async () => {
                const result = await authClient.signOut();
                if (result.error)
                  throw new Error(
                    result.error.message || "Logout failed. Please try again.",
                  );
                router.replace("/login");
                router.refresh();
              })
            }
          >
            {action.busy ? <Spinner /> : <LogOut className="size-4" />}
          </button>
        </header>
        <div className="px-5 lg:hidden">
          <Feedback error={action.error} />
        </div>
        <main
          id="main"
          className="mx-auto max-w-[1440px] px-4 pb-28 pt-7 sm:px-8 lg:px-10 lg:pb-8 lg:pt-9"
        >
          {children}
        </main>
        <footer className="no-print mx-5 mb-24 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-5 text-[11px] text-muted-foreground sm:mx-8 lg:mx-10 lg:mb-6">
          <span>
            apnahostel. <span className="ml-2">Made for student life.</span>
          </span>
          <span className="flex items-center gap-1.5">
            <ShieldCheck className="size-3.5" />
            Safe. Simple. Sorted.
            <ArrowUpRight className="ml-2 size-3.5" />
          </span>
          <MerchantLegal />
        </footer>
      </div>
      <nav
        aria-label="Main navigation"
        className="no-print fixed inset-x-0 bottom-0 z-30 flex border-t border-border bg-white pb-[env(safe-area-inset-bottom)] lg:hidden"
      >
        {links(true)}
      </nav>
    </div>
  );
}
