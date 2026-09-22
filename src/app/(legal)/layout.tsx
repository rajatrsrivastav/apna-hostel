import Link from "next/link";
import { Brand } from "@/components/brand";
import { LegalFooter } from "@/components/merchant-legal";

export default function LegalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto max-w-2xl px-5 py-8">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <Brand />
        <Link href="/login" className="text-xs text-primary hover:underline">
          Back to sign in
        </Link>
      </header>
      <main
        id="main"
        className="mt-9 space-y-5 rounded-3xl border border-border bg-white p-6 text-sm leading-6 sm:p-8"
      >
        {children}
      </main>
      <LegalFooter />
    </div>
  );
}
