// First billable rent period for the October 2026 launch.
export const FEE_COLLECTION_START_DATE = "2026-10-01";

export function collectionStarted(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now);
  const part = (type: string) => parts.find((item) => item.type === type)!.value;
  const date = `${part("year")}-${part("month")}-${part("day")}`;
  return date >= FEE_COLLECTION_START_DATE;
}

export function isPostLaunchFee(fee: { rentMonth: string | null; dueDate: string }) {
  return fee.rentMonth
    ? fee.rentMonth >= FEE_COLLECTION_START_DATE.slice(0, 7)
    : fee.dueDate >= FEE_COLLECTION_START_DATE;
}
