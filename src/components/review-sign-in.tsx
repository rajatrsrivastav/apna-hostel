"use client";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Field, Feedback, Spinner, useAction } from "./form-kit";
export function ReviewSignIn() {
  const action = useAction();
  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        const body = Object.fromEntries(new FormData(event.currentTarget));
        action.run(async () => {
          const response = await fetch("/api/auth/review-login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });
          const result = await response.json().catch(() => ({}));
          if (!response.ok)
            throw new Error(result.message || "Review login is unavailable.");
          window.location.replace("/dashboard");
        });
      }}
    >
      <Field label="Review email">
        <Input
          type="email"
          name="email"
          autoComplete="username"
          maxLength={254}
          required
        />
      </Field>
      <Field label="Review password">
        <Input
          type="password"
          name="password"
          autoComplete="current-password"
          maxLength={1024}
          required
        />
      </Field>
      <Button className="w-full" disabled={action.busy}>
        {action.busy && <Spinner />}Sign in
      </Button>
      <Feedback error={action.error} />
    </form>
  );
}
