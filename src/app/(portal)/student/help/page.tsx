import { studentPage } from "@/lib/access";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Phone, HandHelping, ShieldCheck } from "lucide-react";
export default async function Help() {
  await studentPage();
  const phone = process.env.HOSTEL_SUPPORT_PHONE?.replace(/[^\d+]/g, "");
  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-3xl font-semibold tracking-tight">
        We’re here to help.
      </h1>
      <p className="mb-7 mt-2 text-sm text-muted-foreground">
        मदद चाहिए? हॉस्टल ऑफिस से बात करें।
      </p>
      <Card>
        <HandHelping className="mb-4 size-8 text-primary" />
        <h2 className="text-xl font-semibold">Your hostel office</h2>
        <p className="mb-5 mt-2 text-sm leading-6 text-muted-foreground">
          Payment stuck or fee looks wrong? Contact the office before paying
          again.
        </p>
        {phone ? (
          <Button asChild>
            <a href={`tel:${phone}`}>
              <Phone />
              Call the office
            </a>
          </Button>
        ) : (
          <p className="rounded-xl bg-muted p-4 text-sm">
            Please visit the hostel office for help.
          </p>
        )}
      </Card>
      <div className="mt-6 space-y-3">
        {[
          [
            "Money deducted, but not marked paid?",
            "Open Payments, tap your online payment, then Check payment. If it is still waiting, contact the office.",
          ],
          [
            "Uploaded a UPI screenshot?",
            "The office checks it before marking your fee paid. You don’t need to pay again.",
          ],
          [
            "Payment rejected?",
            "Tap the payment to read the reason. Contact the office or upload the correct screenshot.",
          ],
        ].map(([q, a]) => (
          <details
            key={q}
            className="rounded-xl border border-border bg-white p-4"
          >
            <summary className="min-h-8 cursor-pointer text-sm font-semibold">
              {q}
            </summary>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">{a}</p>
          </details>
        ))}
      </div>
      <p className="mt-6 flex items-center gap-2 text-xs text-muted-foreground">
        <ShieldCheck className="size-4" />
        Never share your UPI PIN or OTP with anyone.
      </p>
    </div>
  );
}
