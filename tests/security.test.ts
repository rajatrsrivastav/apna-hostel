import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";
import { validSignature } from "@/lib/razorpay";
import { profileSchema, amountSchema, dateSchema } from "@/lib/validation";
import { balance } from "@/lib/money";
import { checkOrigin, limitedBody } from "@/lib/http";
import { validateImage } from "@/lib/storage";
describe("Payment and request security", () => {
  it("accepts exact signed bytes and rejects tampering, missing and malformed signatures", () => {
    const body = "order_123|pay_123",
      secret = "test-only-secret";
    const sig = createHmac("sha256", secret).update(body).digest("hex");
    expect(validSignature(body, sig, secret)).toBe(true);
    expect(validSignature(body + " ", sig, secret)).toBe(false);
    for (const invalid of ["", "x".repeat(64), "a", sig.slice(2)])
      expect(validSignature(body, invalid, secret)).toBe(false);
  });
  it("stores currency as integer paise without accepting negative, exponent or rounded input", () => {
    expect(amountSchema.parse("4500.25")).toBe(450025);
    for (const value of [
      "-1",
      "0",
      "1.001",
      "1e3",
      "100001",
      "NaN",
      "Infinity",
    ])
      expect(amountSchema.safeParse(value).success).toBe(false);
  });
  it("rejects impossible dates and invalid student mobile numbers", () => {
    expect(dateSchema.safeParse("2026-02-30").success).toBe(false);
    expect(dateSchema.safeParse("2028-02-29").success).toBe(true);
    expect(
      profileSchema.safeParse({
        fullName: "Test Student",
        phone: "1234567890",
        course: "ITI",
        trade: "Electrician",
        studyYear: "Year 1",
      }).success,
    ).toBe(false);
  });
  it("does not let adjustments become collections or display negative debt", () => {
    expect(balance(50000, 10000, 20000)).toBe(20000);
    expect(balance(50000, 60000)).toBe(0);
  });
  it("blocks cross-origin and absent-origin mutation requests", () => {
    process.env.BETTER_AUTH_URL = "https://hostel.example";
    expect(() =>
      checkOrigin(
        new Request("https://hostel.example/api/profile", {
          headers: { origin: "https://evil.example" },
        }),
      ),
    ).toThrow();
    expect(() =>
      checkOrigin(new Request("https://hostel.example/api/profile")),
    ).toThrow();
    expect(() =>
      checkOrigin(
        new Request("https://hostel.example/api/profile", {
          headers: { origin: "https://hostel.example" },
        }),
      ),
    ).not.toThrow();
  });
  it("caps bodies even when Content-Length is absent or dishonest", async () => {
    await expect(
      limitedBody(
        new Request("https://hostel.example", {
          method: "POST",
          body: "a".repeat(30),
        }),
        10,
      ),
    ).rejects.toThrow();
  });
  it("rejects SVG, HTML, MIME mismatches and oversized uploads", () => {
    expect(() =>
      validateImage(Buffer.from("<svg>bad</svg>"), "image/png"),
    ).toThrow();
    const png = Buffer.concat([
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      Buffer.alloc(10),
    ]);
    expect(() => validateImage(png, "image/jpeg")).toThrow();
    expect(() => validateImage(png, "image/png")).not.toThrow();
    expect(() =>
      validateImage(
        Buffer.concat([png, Buffer.alloc(3 * 1024 * 1024)]),
        "image/png",
      ),
    ).toThrow();
  });
});
