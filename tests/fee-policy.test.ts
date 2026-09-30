import { expect, it } from "vitest";
import { collectionStarted, isPostLaunchFee } from "@/lib/fee-policy";

it("starts collection at midnight on 1 October in India", () => {
  expect(collectionStarted(new Date("2026-09-30T18:29:59Z"))).toBe(false);
  expect(collectionStarted(new Date("2026-09-30T18:30:00Z"))).toBe(true);
});

it("excludes pre-October rent and one-off fees", () => {
  expect(isPostLaunchFee({ rentMonth: "2026-09", dueDate: "2026-09-30" })).toBe(false);
  expect(isPostLaunchFee({ rentMonth: "2026-10", dueDate: "2026-10-31" })).toBe(true);
  expect(isPostLaunchFee({ rentMonth: null, dueDate: "2026-09-30" })).toBe(false);
  expect(isPostLaunchFee({ rentMonth: null, dueDate: "2026-10-01" })).toBe(true);
});

it("keeps the launch cutoff when review login is enabled", () => {
  process.env.ENABLE_CASHFREE_REVIEW_LOGIN = "true";
  try {
    expect(collectionStarted(new Date("2026-09-30T18:29:59Z"))).toBe(false);
  } finally {
    delete process.env.ENABLE_CASHFREE_REVIEW_LOGIN;
  }
});
