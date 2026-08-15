import { expect, test } from "@playwright/test";

/**
 * M4 gate (SPEC.md §15): "Real requestAdapter() path exercised on real
 * WebGPU hardware; frame time measured and logged." This suite probes the
 * CURRENT test-runner browser directly rather than assuming: this exact
 * check (M0's initial probe, re-run mid-build) returned a null adapter
 * early in this project's build session and a real adapter+device later in
 * the SAME session (see docs/limitations for the full account) — hardware
 * availability in a sandboxed Chromium is not assumed to be stable across
 * every invocation, so this stays a real, live probe, not a hard-coded
 * expectation either way. When no adapter is available, the two hardware
 * assertions skip with a visible reason (hard rule: never a silent skip);
 * every other test in this file always runs, since the app's OWN fallback
 * behavior (rendering something correctly regardless of rung) must hold
 * either way.
 */

test("real requestAdapter() probe, logged (never asserted blind)", async ({ page }) => {
  await page.goto("/");
  const probe = await page.evaluate(async () => {
    if (!navigator.gpu) return { hasGpuObject: false, adapter: null };
    const adapter = await navigator.gpu.requestAdapter();
    return { hasGpuObject: true, adapter: adapter ? "present" : null };
  });
  console.log(`[M4] navigator.gpu.requestAdapter() probe: ${JSON.stringify(probe)}`);
  expect(probe).toBeTruthy();
});

test("the capability line resolves to a real, working rung whatever this runner's hardware supports", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("status-line")).toContainText("Settled after", { timeout: 20_000 });
  const rung = await page.getByTestId("capability-line").getAttribute("data-rung");
  expect(["webgpu", "webgl2", "static"]).toContain(rung);
  console.log(`[M4] resolved rung in this runner: ${String(rung)}`);
});

test("WebGPU rung: real compute + render, measured frame time, zero console errors (skips with a visible reason if no adapter is available in this runner)", async ({ page }) => {
  const adapterAvailable = await page.evaluate(async () => {
    if (!navigator.gpu) return false;
    const a = await navigator.gpu.requestAdapter();
    return a !== null;
  });
  test.skip(!adapterAvailable, "no WebGPU adapter available in this test-runner's browser — env-gated, not silently skipped (see docs/limitations for the real-hardware pass this build DID complete, in a different session context)");

  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });

  await page.goto("/");
  await expect(page.getByTestId("capability-line")).toHaveAttribute("data-rung", "webgpu", { timeout: 10_000 });

  const start = Date.now();
  await expect(page.getByTestId("status-line")).toContainText("Settled after", { timeout: 20_000 });
  const wallClockMs = Date.now() - start;
  const statusText = await page.getByTestId("status-line").textContent();
  const stepMatch = /(\d+) steps/.exec(statusText ?? "");
  const steps = stepMatch ? Number(stepMatch[1]) : 0;
  console.log(`[M4] WebGPU naive path: ${String(steps)} steps in ${String(wallClockMs)}ms wall-clock (${(wallClockMs / Math.max(1, steps)).toFixed(1)}ms/step avg, includes pipeline warmup)`);

  expect(errors, `console errors during WebGPU run: ${errors.join(" | ")}`).toEqual([]);
  expect(steps).toBeGreaterThan(0);
});
