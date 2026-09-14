"use client";
import { useState } from "react";
import Link from "next/link";
import { Search, ArrowUpRight, SlidersHorizontal, Users } from "lucide-react";
import { Input } from "./ui/input";
import { StatusBadge } from "./ui/badge";
import { money, dateLabel } from "@/lib/money";
export type StudentRow = {
  id: string;
  name: string;
  phone: string | null;
  course: string | null;
  outstanding: number;
  paid: number;
  pending: boolean;
  status: "paid" | "pending" | "unpaid";
  last_payment: string | null;
};
export function AdminStudents({
  students,
  compact = false,
}: {
  students: StudentRow[];
  compact?: boolean;
}) {
  const [query, setQuery] = useState(""),
    [course, setCourse] = useState(""),
    [status, setStatus] = useState("");
  const filtered = students.filter(
    (s) =>
      (!query ||
        `${s.name} ${s.phone || ""}`
          .toLowerCase()
          .includes(query.toLowerCase())) &&
      (!course || s.course === course) &&
      (!status || s.status === status),
  );
  const [page, setPage] = useState(0);
  const rows = compact
    ? filtered.slice(0, 5)
    : filtered.slice(page * 20, page * 20 + 20);
  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-5 py-4">
        <div className="flex items-center gap-3">
          <h2 className="font-semibold">
            {compact ? "Student overview" : "All students"}
          </h2>
          <span className="rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">
            {students.length}
          </span>
        </div>
        {compact && (
          <Link
            href="/admin/students"
            className="flex min-h-11 items-center gap-1 text-xs font-semibold text-primary"
          >
            View all students
            <ArrowUpRight className="size-4" />
          </Link>
        )}
      </div>
      <div className="flex flex-wrap gap-3 p-4 sm:p-5">
        <div className="relative min-w-0 flex-1 basis-56">
          <Search className="absolute left-3.5 top-4 size-4 text-muted-foreground" />
          <Input
            aria-label="Search by student name or phone"
            className="pl-10 text-sm"
            placeholder="Search name or phone…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(0);
            }}
          />
        </div>
        <select
          aria-label="Filter course"
          className="!w-auto flex-1 text-sm sm:flex-none"
          value={course}
          onChange={(e) => {
            setCourse(e.target.value);
            setPage(0);
          }}
        >
          <option value="">All courses</option>
          <option>ITI</option>
          <option>Diploma</option>
        </select>
        <select
          aria-label="Filter status"
          className="!w-auto flex-1 text-sm sm:flex-none"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(0);
          }}
        >
          <option value="">All statuses</option>
          <option value="paid">Paid</option>
          <option value="unpaid">Unpaid</option>
          <option value="pending">Verification pending</option>
        </select>
      </div>
      {rows.length ? (
        <>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-left text-sm">
              <thead className="border-y border-border bg-[#f8f9f6] text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                <tr>
                  {[
                    "Student",
                    "Course",
                    "Amount due",
                    "Amount paid",
                    "Status",
                    "Last payment",
                    "",
                  ].map((h, i) => (
                    <th key={i} className="whitespace-nowrap px-5 py-3">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((s) => (
                  <tr
                    key={s.id}
                    className="border-b border-border last:border-0 hover:bg-muted/40"
                  >
                    <td className="px-5 py-4">
                      <Link
                        className="flex min-h-11 items-center gap-3"
                        href={`/admin/students/${s.id}`}
                      >
                        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[#edf0e6] text-xs font-semibold text-primary">
                          {s.name
                            .split(" ")
                            .slice(0, 2)
                            .map((n) => n[0])
                            .join("")}
                        </span>
                        <span>
                          <span className="block font-semibold">{s.name}</span>
                          <span className="mt-1 block text-xs text-muted-foreground">
                            {s.phone || "Profile incomplete"}
                          </span>
                        </span>
                      </Link>
                    </td>
                    <td className="px-5 py-4">
                      <span className="rounded-md bg-muted px-2 py-1 text-xs">
                        {s.course || "—"}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-5 py-4 font-medium">
                      {money(s.outstanding)}
                    </td>
                    <td className="whitespace-nowrap px-5 py-4 text-muted-foreground">
                      {money(s.paid)}
                    </td>
                    <td className="px-5 py-4">
                      <StatusBadge status={s.status} />
                    </td>
                    <td className="whitespace-nowrap px-5 py-4 text-xs text-muted-foreground">
                      {s.last_payment ? dateLabel(s.last_payment) : "—"}
                    </td>
                    <td className="pr-4">
                      <Link
                        href={`/admin/students/${s.id}`}
                        aria-label={`Manage ${s.name}`}
                        className="flex size-11 items-center justify-center"
                      >
                        <ArrowUpRight className="size-4 text-muted-foreground" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="md:hidden">
            {rows.map((s) => (
              <Link
                key={s.id}
                href={`/admin/students/${s.id}`}
                className="block space-y-3 border-t border-border p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">{s.name}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {s.phone || "Profile incomplete"} · {s.course || "—"}
                    </p>
                  </div>
                  <ArrowUpRight className="size-4 shrink-0" />
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <StatusBadge status={s.status} />
                  <span className="text-sm font-semibold">
                    {money(s.outstanding)} due
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Paid {money(s.paid)} · Last payment{" "}
                  {s.last_payment ? dateLabel(s.last_payment) : "—"}
                </p>
              </Link>
            ))}
          </div>
        </>
      ) : (
        <div className="flex flex-col items-center px-5 py-12 text-center">
          <Users className="mb-3 size-8 text-muted-foreground" />
          <h3 className="font-semibold">
            {students.length
              ? "No students match"
              : "Ready for your first student"}
          </h3>
          <p className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">
            {students.length
              ? "Try another name, phone number, or filter."
              : "Students appear here after they sign in with Google. Share your portal link to get started."}
          </p>
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-5 py-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-2">
          <SlidersHorizontal className="size-3.5" />
          Showing {rows.length} of {filtered.length} students
        </span>
        {!compact && filtered.length > 20 && (
          <div className="flex gap-3">
            <button
              className="min-h-11 disabled:opacity-40"
              disabled={page === 0}
              onClick={() => setPage((p) => p - 1)}
            >
              Previous
            </button>
            <button
              className="min-h-11 disabled:opacity-40"
              disabled={(page + 1) * 20 >= filtered.length}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
