import { redirect } from "next/navigation";

export default async function PaymentStatusPage({
  searchParams,
}: {
  searchParams: Promise<{ order_id?: string }>;
}) {
  const { order_id } = await searchParams;
  redirect(order_id && order_id.length <= 100
    ? `/student/history?order_id=${encodeURIComponent(order_id)}`
    : "/student/history");
}
