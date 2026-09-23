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
  useRef: (current: unknown) => ({ current }),
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
  useRouter: () => ({ refresh: state.refresh, push: state.push, replace: state.push }),
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
  return [...(isButton ? [element] : []), ...buttons(element.props?.children)];
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
        ? { orderId: "order-123", payment_session_id: "session-123" }
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
  expect(initialButtons).toHaveLength(1); // Cashfree only
});

it("initiating online checkout calls order endpoint and launches hosted checkout", async () => {
  const initialButtons = buttons(render());
  // Click "Pay online" (index 0)
  await initialButtons[0].props.onClick!();
  await vi.advanceTimersByTimeAsync(0);
  expect(
    fetchMock.mock.calls.some(([path]) =>
      String(path).includes("/api/payments/order"),
    ),
  ).toBe(true);
  // Cashfree opens in a modal; the returned state goes to Payments for server verification.
  const { load } = await import("@cashfreepayments/cashfree-js");
  expect(load).toHaveBeenCalledWith({ mode: "production" });
  const instance = await vi.mocked(load).mock.results[0].value;
  expect(instance.checkout).toHaveBeenCalledWith({
    paymentSessionId: "session-123",
    redirectTarget: "_modal",
  });
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(state.push).toHaveBeenCalledWith("/student/history?order_id=order-123");
});

it("does not launch checkout without a server-issued payment session", async () => {
  fetchMock.mockResolvedValueOnce(Response.json({ orderId: "order-123" }));
  await buttons(render())[0].props.onClick!();
  const { load } = await import("@cashfreepayments/cashfree-js");
  expect(load).not.toHaveBeenCalled();
  expect(state.values).toContain("Could not start checkout. Please try again.");
});

it("sends an abandoned checkout to Payments without declaring failure", async () => {
  const { load } = await import("@cashfreepayments/cashfree-js");
  vi.mocked(load).mockResolvedValueOnce({
    checkout: vi.fn().mockResolvedValue({ error: { message: "Checkout closed" } }),
  });
  await buttons(render())[0].props.onClick!();
  expect(state.push).toHaveBeenCalledWith("/student/history?order_id=order-123");
});
