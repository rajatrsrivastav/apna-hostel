import { MerchantLegal } from "@/components/merchant-legal";
import { currentUser, homePath } from "@/lib/access";
import { redirect } from "next/navigation";
import { Brand } from "@/components/brand";
import { SignIn } from "@/components/sign-in";
import {
  ArrowUpRight,
  BedDouble,
  Check,
  GraduationCap,
  ShieldCheck,
  Wallet,
} from "lucide-react";
export const dynamic = "force-dynamic";
export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await currentUser();
  if (user) redirect(homePath(user));
  const { error } = await searchParams;
  return (
    <div className="min-h-dvh p-5 sm:p-8 lg:p-12">
      <header className="mx-auto flex max-w-6xl items-center justify-between">
        <Brand />
        <span className="hidden items-center gap-2 text-xs text-muted-foreground sm:flex">
          <ShieldCheck className="size-4" />
          Your hostel. Your space.
        </span>
      </header>
      <main
        id="main"
        className="mx-auto grid max-w-6xl items-center gap-8 py-9 sm:py-12 lg:min-h-[80vh] lg:grid-cols-2 lg:gap-24"
      >
        <div className="hidden lg:block">
          <span className="mb-6 inline-flex items-center gap-2 rounded-full border border-[#d4e3d4] bg-[#edf4e9] px-3 py-1.5 text-xs font-medium text-primary">
            <span className="size-1.5 rounded-full bg-primary" /> LESS HASSLE.
            MORE STUDENT LIFE.
          </span>
          <h1 className="max-w-lg text-5xl font-semibold leading-[1.12] tracking-[-0.05em] sm:text-6xl">
            A place to stay.
            <br />
            One less thing
            <br />
            <span className="text-primary">to worry about.</span>
          </h1>
          <p className="mt-6 max-w-sm text-base leading-7 text-muted-foreground">
            Hostel fees, without the queues. Pay your fee, check your status,
            and get back to what matters.
          </p>
          <div className="mt-9 flex gap-6 text-xs text-primary">
            <span className="flex items-center gap-2">
              <Check className="size-4" />
              Simple payments
            </span>
            <span className="flex items-center gap-2">
              <Check className="size-4" />
              Safe & secure
            </span>
          </div>
          <div className="mt-12 hidden gap-3 sm:flex" aria-hidden="true">
            {[
              [BedDouble, "Your home"],
              [GraduationCap, "Your future"],
              [Wallet, "All sorted"],
            ].map(([Icon, label]) => {
              const I = Icon as typeof Wallet;
              return (
                <div
                  key={String(label)}
                  className="flex items-center gap-3 rounded-2xl border border-border bg-white px-5 py-4"
                >
                  <I className="size-5 text-primary" />
                  <span className="text-xs">{String(label)}</span>
                </div>
              );
            })}
          </div>
        </div>
        <div className="relative">
          <div className="absolute -right-3 -top-3 -z-10 h-full w-full rounded-3xl border border-[#d7ddcd] bg-[#e9edde] sm:-right-5 sm:-top-5" />
          <section className="rounded-3xl border border-border bg-white p-5 shadow-[0_20px_80px_-40px_#36553b40] sm:p-10">
            <div className="mb-7 flex size-12 items-center justify-center rounded-2xl bg-[#eff4e9]">
              <GraduationCap className="size-6 text-primary" />
            </div>
            <p className="text-xs font-semibold tracking-[0.16em] text-muted-foreground">
              STUDENT FEE PORTAL
            </p>
            <h2 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">
              Welcome home <span className="text-[#d59b58]">✦</span>
            </h2>
            <p className="mt-3 text-sm text-muted-foreground">
              नमस्ते! अपनी फीस आसानी से भरें।
            </p>
            <div className="my-8 h-px bg-border" />
            <p className="mb-5 text-sm">Sign in to manage your hostel fee.</p>
            <SignIn />
            {error && (
              <p role="alert" className="mt-3 text-sm text-red-700">
                Google sign-in wasn’t completed. Please try again.
              </p>
            )}
            <p className="mt-5 text-center text-xs leading-5 text-muted-foreground">
              No password to remember.
              <br />
              Just use your Google account.
            </p>
            <div className="mt-9 flex items-center justify-between rounded-xl bg-muted px-4 py-3 text-xs text-muted-foreground">
              <span>First time here? You’re in the right place.</span>
              <ArrowUpRight className="size-4 shrink-0" />
            </div>
          </section>
        </div>
      </main>
      <footer className="mx-auto flex max-w-6xl flex-wrap justify-between gap-3 border-t border-border pt-5 text-xs text-muted-foreground">
        <span>Made for student life.</span>
        <span className="flex items-center gap-1.5">
          <ShieldCheck className="size-3.5" />
          Secure Google sign-in
        </span>
        <MerchantLegal />
      </footer>
    </div>
  );
}
