import { expect, test } from "@playwright/test";

// M2 gate: mapping panel (auto-infer + overrides) + separation-gain wired
// and printed, exercised against the real static export.
//
// Pastes its own known CSV (dim_1/dim_2 column names) rather than depending
// on whichever sample dataset the cold-start default happens to be —
// decoupled from that choice on purpose: SPEC.md §10 changed the cold-start
// default mid-build (M5, real dataset instead of synthetic), and these
// tests originally hardcoded the synthetic default's own column names,
// breaking the moment the default changed.
//
// Two tight clusters (dim_2 near 1 or near 9, not an evenly spaced ramp) on
// purpose: an evenly-spaced attraction dimension settles as a slowly-
// relaxing colinear chain (SimulationCanvas.tsx's own comment measures
// ~4500 steps for exactly that shape) — measured directly against
// src/core/ (not assumed), forcing a LOW-variance column into the
// attraction role also measurably slows convergence (500ish steps vs
// 1400+). Both were caught by this suite genuinely timing out, not
// predicted in advance. The override test below changes the CATEGORICAL
// column's role instead (charge on/off) — a real, unambiguous, guaranteed-
// different configuration that measured at ~540 steps either way in the
// CPU/JS reference core. Settle waits below are 45s, not the rest of the
// suite's usual 20s: this machine's Playwright-launched Chromium has no
// WebGPU adapter (a documented, established fact — see docs/limitations)
// and falls to WebGL2, and under real observed load its software-rendered
// frame throughput can drop enough that even ~540 steps needs real wall-
// clock headroom beyond 20s — caught by this suite genuinely timing out at
// 20s more than once, not assumed in advance.
const CSV = ["id,dim_1,dim_2,category", ...Array.from({ length: 16 }, (_, i) => `r${String(i)},${String(i % 3)},${String(i < 8 ? 1 : 9)},${i % 2 === 0 ? "x" : "y"}`)].join("\n");

async function pasteAndRun(page: import("@playwright/test").Page): Promise<void> {
  await page.goto("/");
  await expect(page.getByTestId("status-line")).toContainText("Settled after", { timeout: 45_000 });
  await page.getByTestId("csv-textarea").fill(CSV);
  await page.getByTestId("run-button").click();
  await expect(page.getByTestId("status-line")).toContainText("Settled after", { timeout: 45_000 });
}

test("the mapping panel shows auto-inferred roles and the separation-gain sentence prints verbatim", async ({ page }) => {
  test.setTimeout(60_000); // Playwright's own default 30s per-test timeout would otherwise cut this off before the 45s settle-wait budget above ever gets used.
  await pasteAndRun(page);

  const gain = page.getByTestId("separation-gain");
  await expect(gain).toBeVisible();
  const text = await gain.textContent();
  // Both real verdicts print "(N.NN vs N.NN)" — only the no-meaningful-gain
  // copy also says the word "silhouette" first (SeparationGainDisplay.tsx).
  // This test's own clustered 2-group fixture turned out to clear the
  // stronger-verdict threshold outright (0.96 vs 0.67), caught live rather
  // than assumed, which is what exposed a regex that only matched the other
  // verdict's exact wording.
  expect(text).toMatch(/\(\d\.\d\d vs \d\.\d\d\)/);
  expect(text?.startsWith("No meaningful gain") || text?.startsWith("Physics separates this data better")).toBe(true);

  // Column mapping table is real, labeled, keyboard-operable HTML — never canvas-drawn (SPEC.md §11).
  await expect(page.getByLabel("Force role for column dim_1")).toBeVisible();
});

test("overriding a column's role rebuilds the simulation and reprints a fresh separation-gain", async ({ page }) => {
  test.setTimeout(120_000); // two full settles in one test — needs more than Playwright's 30s default.
  await pasteAndRun(page);
  const before = await page.getByTestId("separation-gain").textContent();

  // category auto-maps to charge; switching it to excluded removes the
  // charge force entirely — a real, unambiguous configuration change.
  await page.getByLabel("Force role for column category").selectOption("excluded");

  // The RunningSimulation remounts (new mappingKey) — status line resets, then settles again.
  await expect(page.getByTestId("status-line")).toContainText("Settling", { timeout: 5_000 });
  await expect(page.getByTestId("status-line")).toContainText("Settled after", { timeout: 45_000 });
  const after = await page.getByTestId("separation-gain").textContent();
  expect(after).toBeTruthy();
  expect(after).not.toBe(before);
});

test("switching a column's normalization to raw shows the outlier-exaggeration note", async ({ page }) => {
  test.setTimeout(60_000);
  await pasteAndRun(page);
  await page.getByLabel("Normalization for column dim_1").selectOption("raw");
  await expect(page.getByText("exaggerates outliers").first()).toBeVisible();
});
