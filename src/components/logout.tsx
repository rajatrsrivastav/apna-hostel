"use client";
import { authClient } from "@/lib/auth-client";
import { Button } from "./ui/button";
import { Feedback, useAction } from "./form-kit";
import { LogOut } from "lucide-react";
export function Logout() {
  const action = useAction();
  return (
    <div>
      <Button
        variant="outline"
        disabled={action.busy}
        onClick={() =>
          action.run(async () => {
            const result = await authClient.signOut();
            if (result.error)
              throw new Error(
                result.error.message || "Logout failed. Please try again.",
              );
            window.location.replace("/login");
          })
        }
      >
        <LogOut />
        Logout
      </Button>
      <Feedback error={action.error} />
    </div>
  );
}
