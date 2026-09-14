import { currentUser } from "@/lib/access";
import { redirect } from "next/navigation";
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (user.role !== "admin") redirect("/dashboard");
  return children;
}
