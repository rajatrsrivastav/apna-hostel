"use client";
import { useState, useTransition } from "react";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <label className="block space-y-2">
      <span className="text-sm font-semibold">{label}</span>
      {children}
      {hint && (
        <span className="block text-xs text-muted-foreground">{hint}</span>
      )}
    </label>
  );
}
export function Feedback({
  error,
  success,
}: {
  error?: string;
  success?: string;
}) {
  if (!error && !success) return null;
  return (
    <div
      role={error ? "alert" : "status"}
      className={`flex items-start gap-2 rounded-xl p-3 text-sm ${error ? "bg-red-50 text-red-800" : "bg-emerald-50 text-emerald-800"}`}
    >
      {error ? (
        <AlertCircle className="mt-0.5 size-4 shrink-0" />
      ) : (
        <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
      )}
      <span>{error || success}</span>
    </div>
  );
}
export function Spinner() {
  return <Loader2 className="size-4 animate-spin" aria-hidden="true" />;
}
export async function api<T = { ok: boolean; message?: string }>(
  path: string,
  body: object | FormData,
  method = "POST",
): Promise<T> {
  const res = await fetch(path, {
    method,
    headers:
      body instanceof FormData
        ? undefined
        : { "Content-Type": "application/json" },
    body: body instanceof FormData ? body : JSON.stringify(body),
  });
  const result = await res
    .json()
    .catch(() => ({ error: "Connection interrupted. Please try again." }));
  if (!res.ok)
    throw new Error(result.error || "Something went wrong. Please try again.");
  return result as T;
}
export function useAction() {
  const [busy, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  function run(action: () => Promise<void> | void) {
    if (busy) return;
    setError("");
    setSuccess("");
    startTransition(async () => {
      try {
        await action();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Please try again.");
      }
    });
  }
  return { busy, error, success, setSuccess, run };
}
