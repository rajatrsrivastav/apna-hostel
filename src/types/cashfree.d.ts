declare module "@cashfreepayments/cashfree-js" {
  export interface CashfreeCheckoutOptions {
    paymentSessionId: string;
    redirectTarget?: "_self" | "_modal" | "_blank" | "_top";
  }

  export interface CashfreeInstance {
    checkout(options: CashfreeCheckoutOptions): Promise<{
      error?: unknown;
      redirect?: boolean;
      paymentDetails?: unknown;
    }>;
  }

  export function load(options: { mode: "production" }): Promise<CashfreeInstance>;
}

