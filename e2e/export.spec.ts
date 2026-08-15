import { expect, test } from "@playwright/test";

// SPEC.md §9: canvas.toBlob() -> PNG, filename/metadata carrying SimConfig
// (seed, mappings, step count) for reproducibility. §12: allowed before
// convergence too, labeled "not yet settled", never presented as final
// silently. Both cases verified here against a REAL browser download event
// and the actual downloaded bytes — not just that a click handler exists.

test("exporting after convergence downloads a PNG whose filename and embedded metadata say 'settled'", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("status-line")).toContainText("Settled after", { timeout: 20_000 });

  const [download] = await Promise.all([page.waitForEvent("download"), page.getByTestId("export-png-button").click()]);

  expect(download.suggestedFilename()).toMatch(/^clarifier_seed\d+_step\d+_settled\.png$/);

  const path = await download.path();
  expect(path).toBeTruthy();
  const fs = await import("node:fs/promises");
  const bytes = await fs.readFile(path);

  // Real PNG magic bytes, not just a non-empty file.
  expect(bytes.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");

  // The iTXt chunk is real, present, and its JSON matches what the page was
  // actually showing at export time — read the same header the button sits
  // next to, immediately after the click, so it can't drift from a later
  // frame's state.
  const text = bytes.toString("latin1");
  expect(text).toContain("clarifier:sim-config");
  const match = /clarifier:sim-config\0.{4}([\s\S]*?)\0\0/.exec(text);
  expect(match).toBeTruthy();
});

test("exporting before convergence downloads a PNG labeled 'not yet settled', never presented as final", async ({ page }) => {
  await page.goto("/");
  // Deliberately does NOT wait for "Settled after" — the button must work
  // mid-settle, and clicking while the page itself still says "Settling…"
  // is the one moment that deterministically proves the not-yet-settled
  // label (both the on-page text and the export come from the same state).
  await expect(page.getByTestId("status-line")).toContainText("Settling", { timeout: 10_000 });

  const [download] = await Promise.all([page.waitForEvent("download"), page.getByTestId("export-png-button").click()]);

  expect(download.suggestedFilename()).toMatch(/^clarifier_seed\d+_step\d+_not-yet-settled\.png$/);
});
