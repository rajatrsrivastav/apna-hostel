import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { studentProfiles } from "@/db/schema";
import { currentUser } from "@/lib/access";
import { Brand } from "@/components/brand";
import { OnboardingForm } from "@/components/onboarding-form";
export const dynamic = "force-dynamic";
export default async function Onboarding() {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (user.role === "admin") redirect("/admin");
  if (user.approvalStatus !== "accepted") redirect("/approval");
  const [profile] = await getDb()
    .select()
    .from(studentProfiles)
    .where(eq(studentProfiles.userId, user.id));
  if (profile) redirect("/dashboard");
  return (
    <main id="main" className="mx-auto max-w-lg px-5 py-8">
      <Brand />
      <div className="mt-9 rounded-3xl border border-border bg-white p-6 sm:p-8">
        <p className="text-xs font-semibold tracking-widest text-primary">
          JUST ONCE. THAT’S ALL.
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">
          A quick introduction.
        </h1>
        <p className="mb-7 mt-2 text-sm text-muted-foreground">
          बस थोड़ी जानकारी, फिर सब आसान।
        </p>
        <OnboardingForm name={user.name} />
      </div>
    </main>
  );
}
