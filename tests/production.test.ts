import { afterEach, expect, it, vi } from "vitest";
import { publicOrigin } from "@/lib/env";
import { assertSafeMigrations } from "../scripts/migration-safety";
const email = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock("resend", () => ({
  Resend: class {
    emails = { send: email.send };
  },
}));
import {
  sendEmail,
} from "@/lib/email";
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  email.send.mockReset();
});

it("requires a canonical HTTPS origin in production and rejects localhost, tunnels, credentials and paths", () => {
  vi.stubEnv("NODE_ENV", "production");
  for (const value of [
    "http://portal.example",
    "https://localhost",
    "https://127.0.0.1",
    "https://[::1]",
    "https://demo.ngrok-free.dev",
    "https://portal.example/path",
    "https://user:pass@portal.example",
    "https://portal.example?next=bad",
  ]) {
    vi.stubEnv("BETTER_AUTH_URL", value);
    expect(() => publicOrigin()).toThrow();
  }
  vi.stubEnv("BETTER_AUTH_URL", "https://portal.example/");
  expect(publicOrigin()).toBe("https://portal.example");
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("BETTER_AUTH_URL", "http://localhost:3000");
  expect(publicOrigin()).toBe("http://localhost:3000");
});
it("fails email delivery honestly when credentials or sender are absent", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.stubEnv("RESEND_API_KEY", "");
  vi.stubEnv("RESEND_FROM_EMAIL", "");
  expect(
    await sendEmail({
      to: "student@example.test",
      subject: "Test",
      html: "Test",
      text: "Test",
    }),
  ).toEqual({ success: false });
  expect(email.send).not.toHaveBeenCalled();
});
it("uses only configured sender and does not expose provider errors", async () => {
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  vi.stubEnv("RESEND_API_KEY", "fake-test-key");
  vi.stubEnv("RESEND_FROM_EMAIL", "Hostel <office@example.test>");
  email.send.mockResolvedValueOnce({ data: { id: "delivered" }, error: null });
  const payload = {
    to: "student@example.test",
    subject: "Test",
    html: "Test",
    text: "Test",
  };
  expect(await sendEmail(payload)).toEqual({ id: "delivered", success: true });
  expect(email.send).toHaveBeenCalledWith({
    ...payload,
    from: "Hostel <office@example.test>",
  });
  email.send.mockResolvedValueOnce({
    error: { message: "private-provider-details" },
  });
  expect(await sendEmail(payload)).toEqual({ success: false });
  expect(JSON.stringify(log.mock.calls)).not.toContain(
    "private-provider-details",
  );
});
it("blocks historical data cleanup on populated databases but allows clean setup and already-applied history", () => {
  expect(() => assertSafeMigrations(0, true)).toThrow("data-deletion");
  expect(() => assertSafeMigrations(0, false)).not.toThrow();
  expect(() => assertSafeMigrations(1789393000000, true)).not.toThrow();
});
