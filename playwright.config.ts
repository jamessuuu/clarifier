import { defineConfig, devices } from "@playwright/test";

/**
 * Runs against the REAL `output: "export"` static build (SPEC §13's
 * `e2e:smoke` stage). `webServer` builds nothing itself — CI runs
 * `pnpm build` first so the zero-functions gate and these tests share one
 * build — it only serves the committed `out/` directory
 * (scripts/serve-out.mjs, a plain static file server, so nothing here ever
 * exercises a Next dev server or a server function).
 */
// Overridable so a run can move off 4173 when something else on this machine
// already holds it. Without it, `reuseExistingServer` will happily point the
// whole suite at a different project's server and every assertion fails
// against someone else's HTML (seen for real, 2026-09-07).
const PORT = Number(process.env.PLAYWRIGHT_PORT ?? 4173);
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
  },
  webServer: {
    command: `node scripts/serve-out.mjs`,
    env: { PORT: String(PORT) },
    url: `${BASE_URL}/`,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
