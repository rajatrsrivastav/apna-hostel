"use client";
import { authClient } from "@/lib/auth-client";
import { Button } from "./ui/button";
import { Feedback, Spinner, useAction } from "./form-kit";
export function SignIn() {
  const action = useAction();
  return (
    <div className="space-y-4">
      <Button
        className="w-full bg-white text-foreground hover:bg-muted border border-border shadow-none"
        size="lg"
        pending={action.busy}
        pendingText="Loading..."
        onClick={() =>
          action.run(async () => {
            const result = await authClient.signIn.social({
              provider: "google",
              callbackURL: "/login",
              errorCallbackURL: "/login?error=oauth",
            });
            if (result.error)
              throw new Error(
                "Sign-in could not start. Please try again or contact the hostel office.",
              );
            await new Promise(() => {}); // keep loading state until navigation completes
          })
        }
      >
        <svg viewBox="0 0 24 24" aria-hidden="true" className="!size-5">
          <path
            fill="#4285F4"
            d="M21.6 12.23c0-.71-.06-1.39-.18-2.05H12v3.88h5.38a4.6 4.6 0 0 1-2 3.02v2.51h3.24c1.9-1.75 2.98-4.33 2.98-7.36Z"
          />
          <path
            fill="#34A853"
            d="M12 22c2.7 0 4.96-.9 6.62-2.41l-3.24-2.51c-.9.6-2.05.97-3.38.97-2.6 0-4.81-1.76-5.6-4.12H3.06v2.59A10 10 0 0 0 12 22Z"
          />
          <path
            fill="#FBBC05"
            d="M6.4 13.93a6 6 0 0 1 0-3.86V7.48H3.06a10 10 0 0 0 0 9.04Z"
          />
          <path
            fill="#EA4335"
            d="M12 5.95c1.47 0 2.79.5 3.82 1.5l2.86-2.87A9.59 9.59 0 0 0 12 2a10 10 0 0 0-8.94 5.48l3.34 2.59C7.19 7.71 9.4 5.95 12 5.95Z"
          />
        </svg>
        Continue with Google
      </Button>
      <Feedback error={action.error} />
    </div>
  );
}
