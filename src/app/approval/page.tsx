import { LegalFooter } from "@/components/merchant-legal";
import { Logout } from "@/components/logout";
import { ApprovalRefresh } from "@/components/approval-refresh";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/access";
export const dynamic = "force-dynamic";
export default async function ApprovalPage() {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (user.role === "admin") redirect("/admin");
  if (!user.hasProfile) redirect("/onboarding");
  if (user.approvalStatus === "accepted") redirect("/dashboard");
  return (
    <main
      id="main"
      className="flex min-h-dvh items-center justify-center p-6 text-center"
    >
      <ApprovalRefresh />
      <div className="space-y-6">
        <h1 className="text-xl font-semibold leading-9">
          {user.approvalStatus === "rejected" ? (
            <>
              Approval Rejected
              <br />
              <span className="text-base font-normal text-muted-foreground">
                Admin ne approval reject kar diya hai.
              </span>
            </>
          ) : (
            <>
              Approval Pending
              <br />
              <span className="text-base font-normal text-muted-foreground">
                Admin se approval pending hai.
              </span>
            </>
          )}
        </h1>
        <Logout />
        <LegalFooter />
      </div>
    </main>
  );
}
