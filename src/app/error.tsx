"use client";
import { Button } from "@/components/ui/button";
import { CircleAlert } from "lucide-react";
export default function ErrorPage({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main
      id="main"
      className="mx-auto flex min-h-[75vh] max-w-sm flex-col items-center justify-center gap-5 p-5 text-center"
    >
      <CircleAlert className="size-10 text-amber-600" />
      <h1 className="text-2xl font-semibold">Let’s try that again</h1>
      <p className="text-muted-foreground">
        We couldn’t load this page. Please check your connection and try again.
      </p>
      <Button onClick={reset}>Try again / फिर कोशिश करें</Button>
    </main>
  );
}
