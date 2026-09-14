import { chromium } from "@playwright/test";
const baseURL = process.env.SMOKE_BASE_URL || "http://127.0.0.1:3000";
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
    "/admin/verification",
  ]) {
    await page.goto(`${baseURL}${path}`);
    await page.waitForURL("**/login");
  }
  if (errors.length) throw new Error(errors.join("\n"));
  console.log(
    "Browser smoke passed: 320/390/1440px, Google button, no overflow, protected routes redirect, no browser errors.",
  );
} finally {
  await browser.close();
}
