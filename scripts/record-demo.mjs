/**
 * Demo recording (showcase-program/DESIGN-DIRECTION.md §3): "a scripted
 * Playwright run against the real site, recorded to video... autoplay,
 * muted, looped, no browser chrome, no cursor jitter. A poster frame."
 *
 * DEVIATION, disclosed: that section also says "these must be recorded
 * against the deployed site, so the recording cannot drift from what a
 * visitor gets." This build operates under a hard rule to make zero
 * deploys and touch nothing outside this repository, so there is no
 * deployed site to record against. This script instead records against the
 * real, committed static export (`pnpm build` then this script's own
 * `scripts/serve-out.mjs` instance) — the same artifact `pnpm e2e` tests
 * against and the same one a human runs locally (see README). The
 * recording therefore cannot drift from what `pnpm build && pnpm start`-
 * equivalent local hosting gives a visitor; it just isn't the live
 * internet deployment SPEC.md's source document assumed would exist.
 * Full account in docs/limitations.
 *
 * Usage: node scripts/record-demo.mjs --out=public/demo
 * (requires `pnpm build` to have already produced out/)
 */
import { chromium } from "@playwright/test";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, renameSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const PORT = 4499;
const BASE_URL = `http://localhost:${String(PORT)}`;
const VIDEO_SIZE = { width: 1280, height: 720 };

async function waitForServer(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      await fetch(url);
      return;
    } catch {
      if (Date.now() > deadline) throw new Error(`server did not come up at ${url} within ${String(timeoutMs)}ms`);
      await delay(300);
    }
  }
}

async function main() {
  const args = Object.fromEntries(
    process.argv.slice(2).map((a) => {
      const [k, v] = a.replace(/^--/, "").split("=");
      return [k, v ?? true];
    })
  );
  const outDir = args.out ?? "public/demo";
  mkdirSync(outDir, { recursive: true });

  if (!existsSync("out/index.html")) {
    console.error("record-demo: out/index.html not found — run `pnpm build` first");
    process.exit(1);
  }

  const videoTmpDir = join(outDir, ".video-tmp");
  mkdirSync(videoTmpDir, { recursive: true });

  console.log(`record-demo: starting serve-out.mjs on ${BASE_URL}`);
  const server = spawn(process.execPath, ["scripts/serve-out.mjs"], { env: { ...process.env, PORT: String(PORT) }, stdio: "ignore" });

  try {
    await waitForServer(BASE_URL, 15_000);

    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: VIDEO_SIZE, recordVideo: { dir: videoTmpDir, size: VIDEO_SIZE } });
    const page = await context.newPage();

    console.log("record-demo: loading cold start (sample #1, Palmer Penguins)…");
    await page.goto(BASE_URL);
    await page.getByTestId("status-line").waitFor({ state: "visible" });
    await page.getByTestId("status-line").filter({ hasText: "Settled after" }).waitFor({ timeout: 40_000 });

    // Let the settled result and the printed separation-gain number sit on
    // screen long enough for a viewer to actually read it.
    await page.waitForTimeout(2_500);

    // Poster frame: a real screenshot of the settled state, not a mockup —
    // shown when `prefers-reduced-motion` asks for the static equivalent,
    // and while the video itself is loading.
    await page.screenshot({ path: join(outDir, "poster.png") });
    console.log("record-demo: wrote poster.png");

    console.log("record-demo: switching to sample #2 to show it respond live…");
    await page.getByTestId("dataset-option-blobs-3-known").click();
    await page.getByTestId("status-line").filter({ hasText: "Settling" }).waitFor({ timeout: 10_000 });
    await page.waitForTimeout(3_000); // enough motion to read as "it's actually simulating", not a jump-cut

    await context.close();
    await browser.close();

    // Playwright names the video file after an internal id, not a path we
    // choose up front — find the one file this run just produced.
    const files = readdirSync(videoTmpDir).filter((f) => f.endsWith(".webm"));
    if (files.length !== 1) throw new Error(`expected exactly one recorded video, found ${String(files.length)}: ${files.join(", ")}`);
    const finalPath = join(outDir, "clarifier-demo.webm");
    renameSync(join(videoTmpDir, files[0]), finalPath);
    rmSync(videoTmpDir, { recursive: true, force: true });

    const sizeKb = (statSync(finalPath).size / 1024).toFixed(0);
    console.log(`record-demo: wrote clarifier-demo.webm (${sizeKb} KB) -> ${outDir}`);
  } finally {
    server.kill();
  }
}

await main();
