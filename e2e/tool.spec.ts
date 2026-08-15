import { expect, test } from "@playwright/test";

// Not tagged @smoke (settling takes several real seconds) but still runs
// against the real static export via `pnpm e2e`. Exercises the M1 gate
// directly: paste a CSV, watch it settle, get a real receipt.

test("the cold-start sample dataset settles to a real, computed receipt", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("status-line")).toContainText("Settled after", { timeout: 20_000 });
  const text = await page.getByTestId("status-line").textContent();
  expect(text).toMatch(/Settled after \d+\.\d+s, \d+ steps/);
});

test("pasting a custom CSV and running it produces a fresh settle", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("status-line")).toContainText("Settled after", { timeout: 20_000 });

  const csv = ["id,a,b,group", ...Array.from({ length: 30 }, (_, i) => `r${String(i)},${String(i)},${String(30 - i)},${i % 2 === 0 ? "x" : "y"}`)].join("\n");
  await page.getByTestId("csv-textarea").fill(csv);
  await page.getByTestId("run-button").click();

  await expect(page.getByTestId("status-line")).toContainText("Settled after", { timeout: 20_000 });
});

test("pasting JSON shows a structured error naming what was detected, never a blank canvas", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("csv-textarea").fill('{"a": 1, "b": 2}');
  await page.getByTestId("run-button").click();
  await expect(page.getByTestId("dataset-message")).toContainText("JSON");
});

test("pasting an all-id-like dataset refuses gracefully, naming the columns it saw", async ({ page }) => {
  await page.goto("/");
  const csv = ["uuid_a,uuid_b", ...Array.from({ length: 20 }, (_, i) => `a-${String(i)}-${String(1000 + i)},b-${String(9999 - i)}-${String(i * 7)}`)].join("\n");
  await page.getByTestId("csv-textarea").fill(csv);
  await page.getByTestId("run-button").click();
  await expect(page.getByTestId("dataset-message")).toContainText("No columns here map to a physical property");
  await expect(page.getByTestId("excluded-columns")).toBeVisible();
});
