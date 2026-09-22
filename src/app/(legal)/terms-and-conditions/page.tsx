import { merchant } from "@/lib/merchant";

export const metadata = { title: "Terms & Conditions" };

export default function Page() {
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
        Terms &amp; Conditions
      </h1>
      <p>
        This portal is operated by {merchant.businessName}, with{" "}
        {merchant.legalName} as its legal proprietor, for{" "}
        {merchant.purpose.toLowerCase()}.
      </p>
      <p>
        Use your own account and provide accurate hostel and contact details.
        Access to student services is subject to the existing hostel approval
        process. Keep your account secure and do not attempt to access another
        student’s information.
      </p>
      <p>
        Review the amount and rent period before making a payment. Payment
        confirmation is subject to verification; a pending or failed transaction
        is not confirmation of rent payment. Contact us if your payment status
        or rent details appear incorrect.
      </p>
      <p>
        Your hostel accommodation arrangements and agreed rent obligations
        continue to apply. For payment disputes, cancellations, or refund
        requests, see our Refund/Cancellation Policy or contact{" "}
        <a
          className="break-all text-primary hover:underline"
          href={`mailto:${merchant.email}`}
        >
          {merchant.email}
        </a>
        .
      </p>
    </>
  );
}
