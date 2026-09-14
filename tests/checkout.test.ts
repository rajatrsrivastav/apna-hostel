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
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: state.refresh, push: state.push }),
}));
import { Checkout, type PayableFee } from "@/components/checkout";
let options: {
  handler: (value: object) => void;
  modal: { ondismiss: () => void };
};
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
  return [
    ...(element.type === "button" ? [element] : []),
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
      pending: { id: "payment-1", method: "razorpay" },
    },
  ];
  state.refresh.mockImplementation(() => {
    dues = dues.map((f) => ({ ...f, pending: undefined }));
  });
  vi.stubGlobal("window", {
    Razorpay: class {
      constructor(value: typeof options) {
        options = value;
      }
      open() {}
      close() {
        options.modal.ondismiss();
      }
      on() {}
    },
  });
  fetchMock = vi.fn(async (path: string) =>
    Response.json(
      path.endsWith("order")
        ? {
            key: "test",
            orderId: "order_test",
            amount: 50000,
            expiresAt: new Date(Date.now() + 900000).toISOString(),
          }
        : path.endsWith("cancel")
          ? { status: "cancelled" }
          : { id: "payment-1", status: "verified" },
    ),
  );
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
it("dismissal persists cancellation and restores both enabled payment options", async () => {
  await buttons(render())[0].props.onClick!();
  options.modal.ondismiss();
  await vi.advanceTimersByTimeAsync(0);
  expect(
    fetchMock.mock.calls.some(([path]) => path === "/api/payments/cancel"),
  ).toBe(true);
  const choices = buttons(render());
  expect(choices).toHaveLength(2);
  expect(choices.every((b) => !b.props.disabled)).toBe(true);
  expect(state.values).toContain("Payment cancelled. You can try again.");
});
it("success followed by dismissal verifies on the server without cancellation", async () => {
  await buttons(render())[0].props.onClick!();
  options.handler({
    razorpay_order_id: "order_test",
    razorpay_payment_id: "pay_test",
    razorpay_signature: "signed",
  });
  options.modal.ondismiss();
  await vi.advanceTimersByTimeAsync(0);
  expect(state.push).toHaveBeenCalledWith("/receipts/payment-1");
  expect(
    fetchMock.mock.calls.some(([path]) => path === "/api/payments/cancel"),
  ).toBe(false);
});
it("a checkout left open releases the UI after fifteen minutes", async () => {
  await buttons(render())[0].props.onClick!();
  await vi.advanceTimersByTimeAsync(900000);
  expect(buttons(render()).every((b) => !b.props.disabled)).toBe(true);
  expect(state.refresh).toHaveBeenCalled();
});
