export function money(paise: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: paise % 100 ? 2 : 0,
  }).format(paise / 100);
}
export function dateLabel(value: string | Date) {
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  }).format(
    typeof value === "string"
      ? new Date(value.length === 10 ? `${value}T00:00:00+05:30` : value)
      : value,
  );
}
export function balance(amount: number, paid: number, waived = 0) {
  return Math.max(0, amount - paid - waived);
}
export function feeStatus(
  outstanding: number,
  paymentPending: boolean,
): "paid" | "pending" | "unpaid" {
  return outstanding === 0 ? "paid" : paymentPending ? "pending" : "unpaid";
}

export function paymentMethodLabel(method: string) {
  return method === "cashfree"
    ? "Online Payment"
    : method === "admin_manual"
      ? "Paid to admin"
      : "Manual UPI";
}
