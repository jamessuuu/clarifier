import { expect, test } from "@playwright/test";

// M3 gate (SPEC.md §6/§11): real capability ladder, capability line, and the
// accessible results panel, exercised against the real static export.

test("capability line reports a real rung and the results panel states real computed findings", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("status-line")).toContainText("Settled after", { timeout: 20_000 });

  const capLine = page.getByTestId("capability-line");
  await expect(capLine).toBeVisible();
  const rung = await capLine.getAttribute("data-rung");
  expect(["webgpu", "webgl2", "static"]).toContain(rung);
  const text = await capLine.textContent();
  expect(text).toMatch(/Running on WebGPU|Running on WebGL2|Running the CPU fallback/);

  // The accessible results panel (SPEC.md §11): cluster count + outlier
  // summary, generated from the same computation as the canvas, not
  // decorative alt text.
  await expect(page.getByText(/\d+ clusters? found, largest first/)).toBeVisible();
  await expect(page.getByTestId("outlier-summary")).toBeVisible();
});

test("prefers-reduced-motion forces the static rung, and reacts live without a reload", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/");
  await expect(page.getByTestId("status-line")).toContainText("Settled after", { timeout: 20_000 });
  await expect(page.getByTestId("capability-line")).not.toHaveAttribute("data-rung", "static");

  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(page.getByTestId("capability-line")).toHaveAttribute("data-rung", "static", { timeout: 5_000 });
  await expect(page.getByTestId("capability-line")).toContainText("Running the CPU fallback, same result, static.");
});

test("prefers-reduced-motion set from the start renders the static rung directly, still settled and findings-complete", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(page.getByTestId("status-line")).toContainText("Settled after", { timeout: 20_000 });
  await expect(page.getByTestId("capability-line")).toHaveAttribute("data-rung", "static");
  await expect(page.getByText(/\d+ clusters? found, largest first/)).toBeVisible();
});
