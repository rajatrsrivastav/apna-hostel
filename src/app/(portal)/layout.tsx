import { redirect } from "next/navigation";
import { currentUser } from "@/lib/access";
import { Shell } from "@/components/shell";
export const dynamic = "force-dynamic";
export default async function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!process.env.DATABASE_URL || !process.env.BETTER_AUTH_SECRET)
    redirect("/login");
  const user = await currentUser();
  if (!user) redirect("/login");
  if (user.role !== "admin" && user.approvalStatus !== "accepted")
    redirect("/approval");
  return <Shell user={{ name: user.name, role: user.role }}>{children}</Shell>;
}
