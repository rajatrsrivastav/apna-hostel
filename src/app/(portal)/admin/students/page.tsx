import { requireAdmin } from "@/lib/access";
import { adminStudents } from "@/lib/data";
import { AdminStudents } from "@/components/admin-students";
export default async function StudentsPage() {
  await requireAdmin();
  const students = await adminStudents();
  return (
    <div className="space-y-7">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">
          Your students<span className="text-[#c48b4c]">.</span>
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Find a student. Keep their fees sorted.
        </p>
      </div>
      <AdminStudents
        students={students.map((s) => ({
          ...s,
          last_payment: s.last_payment
            ? new Date(s.last_payment).toISOString()
            : null,
        }))}
      />
    </div>
  );
}
