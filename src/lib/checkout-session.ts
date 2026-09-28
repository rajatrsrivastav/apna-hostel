// Browser-side recovery is bounded; the server remains authoritative for money.
export type CheckoutResponse = {
  orderId: string;
  payment_session_id?: string;
  alreadyPaid?: boolean;
  state?: "processing" | "closing";
  message?: string;
  amount?: number;
};

async function post<T>(
  path: string,
  body: object,
  signal: AbortSignal,
): Promise<T> {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.any([signal, AbortSignal.timeout(15000)]),
  });
  const result = await response.json();
  if (!response.ok)
    throw new Error(
      result.error || "Unable to check checkout. Please try again.",
    );
  return result;
}

function delay(signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    signal.throwIfAborted();
    const abort = () => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", abort);
      resolve();
    }, 3000);
    signal.addEventListener("abort", abort, { once: true });
  });
}

export async function prepareCheckout(
  details: { feeDueId?: string; amount: string; phone?: string },
  signal: AbortSignal,
  onWaiting: (message: string) => void,
): Promise<CheckoutResponse> {
  const create = () =>
    post<CheckoutResponse>("/api/payments/order", details, signal);
  let result = await create();
  // Poll verification, not order creation, while a legacy cancellation finishes
  // or a real bank payment is pending. Never leave the button locked forever.
  for (let checks = 0; result.state && checks < 10; checks++) {
    onWaiting(result.message ?? "Checking your previous checkout…");
    await delay(signal);
    const verification = await post<{
      state: "paid" | "retry" | "closing" | "processing";
      message: string;
    }>("/api/payments/verify", { order_id: result.orderId }, signal);
    if (verification.state === "paid")
      return { orderId: result.orderId, alreadyPaid: true };
    if (verification.state === "retry") result = await create();
    else
      result = {
        orderId: result.orderId,
        state: verification.state,
        message: verification.message,
      };
  }
  return result;
}

export function watchCheckoutReturn(
  target: EventTarget,
  refresh: () => void,
  restore: () => void,
) {
  const onReturn = (event: Event) => {
    if (event.type === "pageshow" && "persisted" in event && event.persisted)
      restore();
    refresh();
  };
  for (const type of ["focus", "pageshow", "online"])
    target.addEventListener(type, onReturn);
  return () => {
    for (const type of ["focus", "pageshow", "online"])
      target.removeEventListener(type, onReturn);
  };
}
