import { expect, it } from "vitest";
import { collectionStarted, isPostLaunchFee, isCollectibleFee } from "@/lib/fee-policy";

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

it("allows only an explicitly flagged early fee before October", () => {
  const now = new Date("2026-09-29T00:00:00+05:30");
  const fee = { rentMonth: "2026-09", dueDate: "2026-09-30" };
  expect(isCollectibleFee({ ...fee, earlyCollectionEnabled: false }, now)).toBe(false);
  expect(isCollectibleFee({ ...fee, earlyCollectionEnabled: true }, now)).toBe(true);
  expect(isCollectibleFee({ rentMonth: "2026-10", dueDate: "2026-10-31", earlyCollectionEnabled: false }, now)).toBe(false);
});
