import { defineConfig, devices } from "@playwright/test";

/**
 * Runs against the REAL `output: "export"` static build (SPEC §13's
 * `e2e:smoke` stage). `webServer` builds nothing itself — CI runs
 * `pnpm build` first so the zero-functions gate and these tests share one
 * build — it only serves the committed `out/` directory
 * (scripts/serve-out.mjs, a plain static file server, so nothing here ever
 * exercises a Next dev server or a server function).
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: {
    baseURL: "http://localhost:4173",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "node scripts/serve-out.mjs",
    url: "http://localhost:4173/",
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
