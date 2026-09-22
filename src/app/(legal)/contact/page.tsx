import { merchant } from "@/lib/merchant";

export const metadata = { title: "Contact / Legal Information" };

export default function Page() {
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
        Contact / Legal Information
      </h1>
      <dl className="space-y-4">
        {[
          ["Business Name", merchant.businessName],
          ["Legal Name", merchant.legalName],
          ["Purpose", merchant.purpose],
        ].map(([label, value]) => (
          <div key={label}>
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
        <div>
          <dt className="text-xs text-muted-foreground">Contact Email</dt>
          <dd>
            <a
              className="break-all text-primary hover:underline"
              href={`mailto:${merchant.email}`}
            >
              {merchant.email}
            </a>
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Contact Phone</dt>
          <dd>
            <a
              className="text-primary hover:underline"
              href={`tel:${merchant.phone}`}
            >
              {merchant.phone}
            </a>
          </dd>
        </div>
      </dl>
    </>
  );
}
