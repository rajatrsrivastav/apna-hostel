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
vi.mock("@cashfreepayments/cashfree-js", () => ({
  load: vi.fn().mockResolvedValue({
    checkout: vi.fn().mockResolvedValue({}),
  }),
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
      path.includes("/api/payments/order")
        ? { orderId: "order-123", paymentSessionId: "session-123" }
        : { id: "payment-1", status: "verified" },
    ),
  );
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it("renders payment options initially", () => {
  const initialButtons = buttons(render());
  expect(initialButtons).toHaveLength(2); // Pay online & Already paid with UPI
});

it("switching to manual payment view and clicking back restores payment choices", async () => {
  const initialButtons = buttons(render());
  // Click "Already paid with UPI?" (index 1)
  await initialButtons[1].props.onClick!();
  const manualButtons = buttons(render());
  // First button in manual view is "Payment methods" back button
  expect(manualButtons.length).toBeGreaterThanOrEqual(1);
  await manualButtons[0].props.onClick!();
  const restoredButtons = buttons(render());
  expect(restoredButtons).toHaveLength(2);
});

it("initiating online checkout calls order endpoint and launches hosted checkout", async () => {
  const initialButtons = buttons(render());
  // Click "Pay online" (index 0)
  await initialButtons[0].props.onClick!();
  await vi.advanceTimersByTimeAsync(0);
  expect(
    fetchMock.mock.calls.some(([path]) => String(path).includes("/api/payments/order")),
  ).toBe(true);
  // With _self redirect, the browser navigates away — no verify call or router.push
  const { load } = await import("@cashfreepayments/cashfree-js");
  expect(load).toHaveBeenCalled();
});
