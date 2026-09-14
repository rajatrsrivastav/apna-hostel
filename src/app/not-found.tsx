import Link from "next/link";
import { Button } from "@/components/ui/button";
export default function NotFound() {
  return (
    <main id="main" className="mx-auto max-w-md space-y-5 p-10 text-center">
      <h1 className="text-2xl font-semibold">Page not found</h1>
      <p className="text-muted-foreground">This page is no longer available.</p>
      <Button asChild>
        <Link href="/">Go home</Link>
      </Button>
    </main>
  );
}
