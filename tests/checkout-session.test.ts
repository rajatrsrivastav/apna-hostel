import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { prepareCheckout, watchCheckoutReturn } from "@/lib/checkout-session";

const fetchMock = vi.fn<typeof fetch>();
const details = { feeDueId: "fee", amount: "100.00" };
const reply = (body: object, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));
beforeEach(() => {
  vi.useFakeTimers();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it("automatically retries once a previous order finishes asynchronous termination", async () => {
  fetchMock
    .mockImplementationOnce(() =>
      reply(
        {
          orderId: "old",
          state: "closing",
          message: "Closing previous checkout",
        },
        202,
      ),
    )
    .mockImplementationOnce(() => reply({ state: "retry" }))
    .mockImplementationOnce(() =>
      reply({ orderId: "new", payment_session_id: "session" }),
    );
  const notice = vi.fn();
  const prepared = prepareCheckout(details, new AbortController().signal, notice);
  await vi.advanceTimersByTimeAsync(3000);
  expect(await prepared).toMatchObject({
    orderId: "new",
    payment_session_id: "session",
  });
  expect(notice).toHaveBeenCalledWith("Closing previous checkout");
  expect(fetchMock.mock.calls.map(([path]) => path)).toEqual([
    "/api/payments/order",
    "/api/payments/verify",
    "/api/payments/order",
  ]);
});

it("a delayed bank success resolves without creating another order", async () => {
  fetchMock
    .mockImplementationOnce(() =>
      reply({ orderId: "old", state: "processing" }, 202),
    )
    .mockImplementationOnce(() => reply({ state: "paid" }));
  const prepared = prepareCheckout(
    details,
    new AbortController().signal,
    vi.fn(),
  );
  await vi.advanceTimersByTimeAsync(3000);
  expect(await prepared).toEqual({ orderId: "old", alreadyPaid: true });
  expect(fetchMock).toHaveBeenCalledTimes(2);
});

it("bounds status polling so a slow provider cannot leave the button loading forever", async () => {
  fetchMock
    .mockImplementationOnce(() =>
      reply({ orderId: "old", state: "closing" }, 202),
    )
    .mockImplementation(() =>
      reply({ state: "closing", message: "Still closing" }),
    );
  const prepared = prepareCheckout(
    details,
    new AbortController().signal,
    vi.fn(),
  );
  await vi.advanceTimersByTimeAsync(30000);
  expect(await prepared).toMatchObject({ orderId: "old", state: "closing" });
  expect(fetchMock).toHaveBeenCalledTimes(11);
});

it("network failure is retryable without a retained browser lock", async () => {
  fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
  await expect(
    prepareCheckout(details, new AbortController().signal, vi.fn()),
  ).rejects.toThrow("Failed to fetch");
  fetchMock.mockImplementationOnce(() =>
    reply({ orderId: "same", payment_session_id: "session" }),
  );
  await expect(
    prepareCheckout(details, new AbortController().signal, vi.fn()),
  ).resolves.toMatchObject({ orderId: "same" });
});

it("aborts an old polling operation when the page is left or restored", async () => {
  fetchMock.mockImplementationOnce(() =>
    reply({ orderId: "old", state: "closing" }, 202),
  );
  const controller = new AbortController();
  const prepared = prepareCheckout(details, controller.signal, vi.fn());
  const assertion = expect(prepared).rejects.toMatchObject({
    name: "AbortError",
  });
  await vi.advanceTimersByTimeAsync(0);
  controller.abort();
  await assertion;
  await vi.advanceTimersByTimeAsync(3000);
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it("Back from page cache resets local busy state; refresh, focus and internet recovery recheck server state", () => {
  const target = new EventTarget();
  const refresh = vi.fn();
  const restore = vi.fn();
  const cleanup = watchCheckoutReturn(target, refresh, restore);
  target.dispatchEvent(
    Object.assign(new Event("pageshow"), { persisted: true }),
  );
  expect(restore).toHaveBeenCalledTimes(1);
  target.dispatchEvent(
    Object.assign(new Event("pageshow"), { persisted: false }),
  );
  target.dispatchEvent(new Event("focus"));
  target.dispatchEvent(new Event("online"));
  expect(refresh).toHaveBeenCalledTimes(4);
  cleanup();
  target.dispatchEvent(new Event("online"));
  expect(refresh).toHaveBeenCalledTimes(4);
});
