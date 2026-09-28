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

    const directives = Object.fromEntries(cspValue.split(";").map((entry) => {
      const [name, ...values] = entry.trim().split(/\s+/);
      return [name, values];
    }));
    for (const directive of ["form-action", "frame-src", "connect-src"]) {
      expect(directives[directive]).toContain("https://api.cashfree.com");
      expect(directives[directive]).toContain("https://sandbox.cashfree.com");
      expect(directives[directive]).toContain("https://payments-test.cashfree.com");
    }
    expect(directives["frame-src"]).toContain("https://sdk.cashfree.com");
  });
});
