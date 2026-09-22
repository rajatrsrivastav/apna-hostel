import { LegalFooter } from "@/components/merchant-legal";
import { notFound } from "next/navigation";
import { reviewLoginEnabled } from "@/lib/env";
import { Brand } from "@/components/brand";
import { ReviewSignIn } from "@/components/review-sign-in";
export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };
export default function ReviewLogin() {
  if (!reviewLoginEnabled()) notFound();
  return (
    <main id="main" className="mx-auto max-w-lg px-5 py-8">
      <Brand />
      <div className="mt-9 rounded-3xl border border-border bg-white p-6 sm:p-8">
        <h1 className="text-3xl font-semibold tracking-tight">
          Cashfree review login
        </h1>
        <p className="mb-7 mt-2 text-sm text-muted-foreground">
          Dedicated test student access for website verification.
        </p>
        <ReviewSignIn />
      </div>
      <LegalFooter />
    </main>
  );
}
