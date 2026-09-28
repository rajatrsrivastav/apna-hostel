import { expect, it } from "vitest";
import { cashfreeMode } from "@/lib/cashfree";

it("keeps production mode for live credentials and selects sandbox for TEST keys", () => {
  const previous = process.env.CASHFREE_APP_ID;
  try {
    process.env.CASHFREE_APP_ID = "TEST_example";
    expect(cashfreeMode()).toBe("sandbox");
    process.env.CASHFREE_APP_ID = "PROD_example";
    expect(cashfreeMode()).toBe("production");
  } finally {
    if (previous === undefined) delete process.env.CASHFREE_APP_ID;
    else process.env.CASHFREE_APP_ID = previous;
  }
});
