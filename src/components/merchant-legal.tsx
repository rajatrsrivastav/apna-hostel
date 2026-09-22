import Link from "next/link";
import { legalLinks, merchant } from "@/lib/merchant";

export function MerchantLegal() {
  return (
    <div className="w-full space-y-2 text-xs leading-5 text-muted-foreground">
      <div>
        <p>Operated by {merchant.businessName}</p>
        <p>Legal Proprietor: {merchant.legalName}</p>
      </div>
      <nav
        aria-label="Legal information"
        className="flex flex-wrap gap-x-4 gap-y-1"
      >
        {legalLinks.map(({ href, label }) => (
          <Link
            key={href}
            href={href}
            className="underline-offset-4 hover:underline focus-visible:underline"
          >
            {label}
          </Link>
        ))}
      </nav>
    </div>
  );
}

export function LegalFooter() {
  return (
    <footer className="no-print mt-8 border-t border-border pt-5">
      <MerchantLegal />
    </footer>
  );
}
