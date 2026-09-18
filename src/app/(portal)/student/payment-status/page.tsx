import { Suspense } from "react";
import { PaymentStatusClient } from "@/components/payment-status-client";

export default function PaymentStatusPage() {
  return (
    <div className="mx-auto max-w-lg pt-8">
      <Suspense
        fallback={
          <div className="py-12 text-center text-sm text-muted-foreground">
            Loading…
          </div>
        }
      >
        <PaymentStatusClient />
      </Suspense>
    </div>
  );
}
