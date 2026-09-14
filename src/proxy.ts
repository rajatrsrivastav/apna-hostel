import { NextResponse } from "next/server";

// Return a real 404 before Next.js starts streaming the page.
export function proxy() {
  if (process.env.ENABLE_RAZORPAY_REVIEW_LOGIN !== "true")
    return new NextResponse("Not found", {
      status: 404,
      headers: { "Cache-Control": "private, no-store" },
    });
  return NextResponse.next();
}
export const config = { matcher: "/review-login" };
