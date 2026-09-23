import { chromium, expect } from "@playwright/test";
const baseURL = process.env.SMOKE_BASE_URL;
if (!baseURL) throw new Error("Set SMOKE_BASE_URL to the portal origin to verify.");
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`${baseURL}/login`);
    await page.getByRole("button", { name: "Continue with Google" }).waitFor();
    const loginButton = await page
      .getByRole("button", { name: "Continue with Google" })
      .boundingBox();
    if (!loginButton || loginButton.y + loginButton.height > 900)
      throw new Error("Login button is below the first screen");
    await expect(page.getByText("Operated by PARUL PLASTIC", { exact: true })).toBeVisible();
    await expect(page.getByText("Legal Proprietor: RATNESH RAMCHANDRA SHRIVASTAV", { exact: true })).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    );
    if (overflow) throw new Error(`Horizontal overflow at ${width}px`);
    await page.screenshot({
      path: `/tmp/apna-hostel-${width}.png`,
      fullPage: true,
    });
  }
  for (const path of [
    "/student",
    "/admin",
    "/admin/students",
  ]) {
    await page.goto(`${baseURL}${path}`);
    await page.waitForURL("**/login");
  }
  for (const path of ["/contact", "/privacy-policy", "/terms-and-conditions", "/refund-policy", "/review-login"]) {
    const response = await page.goto(`${baseURL}${path}`);
    if (response.status() !== 200) throw new Error(`Public page failed: ${path}`);
    await expect(page.getByText("Operated by PARUL PLASTIC", { exact: true })).toBeVisible();
  }
  const disabled = await page.request.post(`${baseURL}/api/payments/review-pay`);
  if (disabled.status() !== 404) throw new Error("Obsolete simulated-payment route is still present");
  if (errors.length) throw new Error(errors.join("\n"));
  console.log(
    "Browser smoke passed: 320/390/1440px, Google button, no overflow, public legal/reviewer pages, protected routes redirect, obsolete simulation removed, no browser errors.",
  );
} finally {
  await browser.close();
}
