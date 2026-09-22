import { merchant } from "@/lib/merchant";

export const metadata = { title: "Refund/Cancellation Policy" };

export default function Page() {
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
        Refund/Cancellation Policy
      </h1>
      <p>
        {merchant.businessName}, operated by {merchant.legalName}, collects
        hostel/PG rent through this portal.
      </p>
      <p>
        If you made a duplicate or incorrect payment, or your account was
        debited without a confirmed payment, contact{" "}
        <a
          className="break-all text-primary hover:underline"
          href={`mailto:${merchant.email}`}
        >
          {merchant.email}
        </a>{" "}
        or{" "}
        <a
          className="text-primary hover:underline"
          href={`tel:${merchant.phone}`}
        >
          {merchant.phone}
        </a>{" "}
        with the transaction reference, date, and amount. Do not send passwords,
        OTPs, or full card details.
      </p>
      <p>
        Refund requests are reviewed against the payment record and your
        applicable hostel rental arrangements. Submitting a request does not
        automatically approve a refund. Any eligibility, approved amount, and
        expected processing time will be communicated after review.
      </p>
      <p>
        For pending payments, check the status before paying again. Processing
        and reversal times can depend on the payment provider and bank.
      </p>
      <p>
        To cancel accommodation or discuss future rent obligations, contact the
        hostel management using the details above. Cancelling a payment attempt
        does not cancel accommodation or remove rent that is due.
      </p>
    </>
  );
}
