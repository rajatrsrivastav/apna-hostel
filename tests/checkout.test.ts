import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ReactElement } from "react";
const state = vi.hoisted(() => ({
  values: [] as unknown[],
  cursor: 0,
  refresh: vi.fn(),
  push: vi.fn(),
}));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useEffect: vi.fn(),
  useState: (initial: unknown) => {
    const index = state.cursor++;
    if (!(index in state.values)) state.values[index] = initial;
    return [
      state.values[index],
      (value: unknown) => {
        state.values[index] = value;
      },
    ];
  },
  useTransition: () => {
    const index = state.cursor++;
    if (!(index in state.values)) state.values[index] = false;
    return [
      state.values[index],
      (cb: () => void | Promise<void>) => {
        state.values[index] = true;
        const res = cb();
        if (res instanceof Promise) {
          res.finally(() => {
            state.values[index] = false;
          });
        } else {
          state.values[index] = false;
        }
      },
    ];
  },
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: state.refresh, push: state.push }),
}));
import { Checkout, type PayableFee } from "@/components/checkout";
import { Button } from "@/components/ui/button";
let dues: PayableFee[];
let fetchMock: ReturnType<typeof vi.fn>;
function render() {
  state.cursor = 0;
  return Checkout({ dues });
}
function buttons(
  node: unknown,
): ReactElement<{ disabled?: boolean; onClick?: () => Promise<void> }>[] {
  if (!node || typeof node !== "object") return [];
  if (Array.isArray(node)) return node.flatMap(buttons);
  const element = node as ReactElement<{
    children?: unknown;
    disabled?: boolean;
    onClick?: () => Promise<void>;
  }>;
  const isButton =
    element.type === "button" ||
    element.type === Button ||
    typeof element.props?.onClick === "function";
  return [
    ...(isButton ? [element] : []),
    ...buttons(element.props?.children),
  ];
}
beforeEach(() => {
  vi.useFakeTimers();
  state.values = [];
  vi.clearAllMocks();
  dues = [
    {
      id: "fee-1",
      label: "Rent",
      dueDate: "2026-10-01",
      outstanding: 50000,
    },
  ];
  state.refresh.mockImplementation(() => {
    dues = dues.map((f) => ({ ...f, pending: undefined }));
  });
  fetchMock = vi.fn(async (path: string) =>
    Response.json(
      path.includes("review-pay")
        ? { id: "payment-1", status: "verified" }
        : { id: "payment-1", status: "verified" },
    ),
  );
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it("clicking pay online switches to Cashfree review view without throwing errors", async () => {
  const initialButtons = buttons(render());
  expect(initialButtons).toHaveLength(2); // Pay online & Already paid with UPI
  await initialButtons[0].props.onClick!();
  const reviewButtons = buttons(render());
  // In review view: Back button, Simulate demo payment, Back to payment options
  expect(reviewButtons.length).toBeGreaterThanOrEqual(2);
});

it("back button in Cashfree review view restores payment choices", async () => {
  await buttons(render())[0].props.onClick!();
  const reviewButtons = buttons(render());
  // Click back to payment options (the last button)
  const backBtn = reviewButtons[reviewButtons.length - 1];
  await backBtn.props.onClick!();
  const restoredButtons = buttons(render());
  expect(restoredButtons).toHaveLength(2);
});

it("simulating test payment calls review-pay endpoint and redirects to receipt", async () => {
  await buttons(render())[0].props.onClick!();
  const reviewButtons = buttons(render());
  // Simulate Test Payment button is index 1
  const simulateBtn = reviewButtons[1];
  await simulateBtn.props.onClick!();
  await vi.advanceTimersByTimeAsync(0);
  expect(
    fetchMock.mock.calls.some(([path]) => String(path).includes("/api/payments/review-pay")),
  ).toBe(true);
  expect(state.push).toHaveBeenCalledWith("/receipts/payment-1");
});
