import { expect, test } from "@playwright/test";

// M2 gate: mapping panel (auto-infer + overrides) + separation-gain wired
// and printed, exercised against the real static export.

test("the mapping panel shows auto-inferred roles and the separation-gain sentence prints verbatim", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("status-line")).toContainText("Settled after", { timeout: 20_000 });

  const gain = page.getByTestId("separation-gain");
  await expect(gain).toBeVisible();
  const text = await gain.textContent();
  expect(text).toMatch(/silhouette \d\.\d\d vs \d\.\d\d/);
  expect(text?.startsWith("No meaningful gain") || text?.startsWith("Physics separates this data better")).toBe(true);

  // Column mapping table is real, labeled, keyboard-operable HTML — never canvas-drawn (SPEC.md §11).
  await expect(page.getByLabel("Force role for column dim_1")).toBeVisible();
});

test("overriding a column's role rebuilds the simulation and reprints a fresh separation-gain", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("status-line")).toContainText("Settled after", { timeout: 20_000 });
  const before = await page.getByTestId("separation-gain").textContent();

  await page.getByLabel("Force role for column dim_2").selectOption("attraction");

  // The RunningSimulation remounts (new mappingKey) — status line resets, then settles again.
  await expect(page.getByTestId("status-line")).toContainText("Settling", { timeout: 5_000 });
  await expect(page.getByTestId("status-line")).toContainText("Settled after", { timeout: 20_000 });
  const after = await page.getByTestId("separation-gain").textContent();
  expect(after).toBeTruthy();
  expect(after).not.toBe(before);
});

test("switching a column's normalization to raw shows the outlier-exaggeration note", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("status-line")).toContainText("Settled after", { timeout: 20_000 });
  await page.getByLabel("Normalization for column dim_1").selectOption("raw");
  await expect(page.getByText("exaggerates outliers").first()).toBeVisible();
});
