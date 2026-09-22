import { describe, expect, it } from "vitest";
import nextConfig from "../next.config";

describe("Next.js Content-Security-Policy headers", () => {
  it("includes Cashfree domains in form-action, frame-src, and connect-src", async () => {
    expect(typeof nextConfig.headers).toBe("function");
    const headersList = await nextConfig.headers!();
    expect(headersList.length).toBeGreaterThan(0);

    const rootHeaderConfig = headersList.find((h) => h.source === "/(.*)");
    expect(rootHeaderConfig).toBeDefined();

    const cspHeader = rootHeaderConfig?.headers.find(
      (h) => h.key === "Content-Security-Policy",
    );
    expect(cspHeader).toBeDefined();

    const cspValue = cspHeader?.value ?? "";

    expect(cspValue).toContain(
      "form-action 'self' https://api.cashfree.com https://payments.cashfree.com;",
    );
    expect(cspValue).toContain(
      "frame-src 'self' https://sdk.cashfree.com https://api.cashfree.com https://payments.cashfree.com;",
    );
    expect(cspValue).toContain(
      "connect-src 'self' https://api.cashfree.com https://payments.cashfree.com;",
    );
  });
});
