import { merchant } from "@/lib/merchant";

export const metadata = { title: "Privacy Policy" };

export default function Page() {
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
        Privacy Policy
      </h1>
      <p>
        {merchant.businessName}, operated by {merchant.legalName}, uses this
        portal for {merchant.purpose.toLowerCase()}.
      </p>
      <p>
        We use your Google account information, hostel profile, and payment
        details to identify your account, manage student approval and rent dues,
        record payments, and provide receipts and notifications.
      </p>
      <p>
        Authentication, payment, storage, and notification providers process
        information needed to deliver these services. Authorized hostel
        administrators can access student and payment information for hostel
        management. These records are not publicly accessible.
      </p>
      <p>
        For questions about your information or requests to correct or delete
        it, contact us at{" "}
        <a
          className="break-all text-primary hover:underline"
          href={`mailto:${merchant.email}`}
        >
          {merchant.email}
        </a>
        . Some records may need to be retained for payment reconciliation and
        applicable recordkeeping requirements.
      </p>
    </>
  );
}
