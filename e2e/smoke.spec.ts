import { expect, test } from "@playwright/test";

// @smoke — SPEC.md §13 e2e:smoke stage. Runs against the real `out/` static
// export via scripts/serve-out.mjs (see playwright.config.ts), never a Next
// dev server, so a pass here means the actual shipped artifact works.

test("@smoke home page loads with zero server functions and no console errors", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("pageerror", (err) => consoleErrors.push(String(err)));

  const response = await page.goto("/");
  expect(response?.status()).toBe(200);
  await expect(page.locator("h1")).toContainText("clarifier");
  expect(consoleErrors, `console errors: ${consoleErrors.join(" | ")}`).toEqual([]);
});

test("@smoke docs routes all resolve", async ({ page }) => {
  for (const path of ["/docs", "/docs/quickstart", "/docs/concept", "/docs/failure-modes", "/docs/limitations"]) {
    const response = await page.goto(path);
    expect(response?.status(), `${path} should return 200`).toBe(200);
  }
});

test("@smoke favicon and manifest are wired", async ({ page }) => {
  const response = await page.goto("/");
  expect(response?.status()).toBe(200);
  const iconHref = await page.locator('link[rel="icon"][type="image/svg+xml"]').getAttribute("href");
  expect(iconHref).toBe("/brand/favicon.svg");
  const manifestHref = await page.locator('link[rel="manifest"]').getAttribute("href");
  expect(manifestHref).toBeTruthy();
});

test("@smoke renders at 320px without horizontal overflow", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto("/");
  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
  expect(scrollWidth, "page should not overflow horizontally at 320px").toBeLessThanOrEqual(clientWidth + 1);
});
