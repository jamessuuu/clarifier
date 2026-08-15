// SPEC.md §8/§14 "zero-functions gate": CI asserts the built app declares no
// Serverless and no Edge Functions. Run after `pnpm build` (which runs
// `next build --webpack` against `output: "export"`).
//
// This is a product claim, not a formality: clarifier's "$0 at any traffic"
// claim and its "nothing you paste ever leaves your device" privacy claim
// both rest on there being no server to compromise, rate limit, or pay for.
// Checked at two independent levels so a config drift AND a build-artifact
// drift both fail loudly:
//   1. SOURCE: next.config.ts still declares `output: "export"`; no
//      middleware.ts/route handler files exist under src/app.
//   2. BUILD ARTIFACT: .next/export-detail.json reports a successful static
//      export (Next refuses to emit this if any server-only feature was
//      present — the build would have hard-errored instead); the middleware
//      manifest declares zero middleware and zero Edge Functions; out/
//      contains real static HTML for every SPEC.md §8 route; the brand and
//      OG assets referenced from metadata actually exist in the export.
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));

let failed = false;
const fail = (msg) => {
  console.error(`FAIL zero-functions: ${msg}`);
  failed = true;
};
const ok = (msg) => {
  console.log(`ok   zero-functions: ${msg}`);
};

function findFiles(dir, matcher, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) findFiles(p, matcher, out);
    else if (matcher(name)) out.push(p);
  }
  return out;
}

// --- 1. Source-level --------------------------------------------------------

const configPath = path.join(repoRoot, "next.config.ts");
const configSrc = existsSync(configPath) ? readFileSync(configPath, "utf8") : "";
if (/output\s*:\s*["']export["']/.test(configSrc)) {
  ok('next.config.ts declares output: "export"');
} else {
  fail('next.config.ts does not declare output: "export" — the zero-functions guarantee has no source-level backing');
}

const middlewareFiles = findFiles(path.join(repoRoot, "src"), (n) => /^middleware\.(ts|tsx|js|mjs)$/.test(n));
if (middlewareFiles.length === 0) {
  ok("no middleware.ts/js under src");
} else {
  fail(`middleware file(s) present: ${middlewareFiles.join(", ")}`);
}

const routeHandlers = findFiles(path.join(repoRoot, "src", "app"), (n) => /^route\.(ts|tsx|js|mjs)$/.test(n));
if (routeHandlers.length === 0) {
  ok("no route.ts handlers under src/app");
} else {
  fail(`route handler file(s) present: ${routeHandlers.join(", ")}`);
}

// --- 2. Build-artifact level -------------------------------------------------

const nextDir = path.join(repoRoot, ".next");
const outDir = path.join(repoRoot, "out");

if (!existsSync(nextDir) || !existsSync(outDir)) {
  fail(`build output missing (${nextDir} / ${outDir}) — run "pnpm build" first`);
} else {
  const exportDetailPath = path.join(nextDir, "export-detail.json");
  if (existsSync(exportDetailPath)) {
    const detail = JSON.parse(readFileSync(exportDetailPath, "utf8"));
    if (detail.success === true) {
      ok("Next reports a successful static export (export-detail.json success:true)");
    } else {
      fail("export-detail.json exists but success is not true");
    }
  } else {
    fail("no .next/export-detail.json — the build did not run a static export");
  }

  const middlewareManifestPath = path.join(nextDir, "server", "middleware-manifest.json");
  if (existsSync(middlewareManifestPath)) {
    const manifest = JSON.parse(readFileSync(middlewareManifestPath, "utf8"));
    const middlewareCount = Object.keys(manifest.middleware ?? {}).length;
    const functionsCount = Object.keys(manifest.functions ?? {}).length;
    if (middlewareCount === 0 && functionsCount === 0) {
      ok("middleware-manifest.json declares zero middleware and zero Edge Functions");
    } else {
      fail(`middleware-manifest.json declares ${String(middlewareCount)} middleware and ${String(functionsCount)} functions`);
    }
  } else {
    fail("no .next/server/middleware-manifest.json to verify");
  }

  // SPEC.md §8 route list.
  const expectedHtml = [
    "index.html",
    "docs.html",
    "docs/quickstart.html",
    "docs/concept.html",
    "docs/failure-modes.html",
    "docs/limitations.html",
  ];
  for (const name of expectedHtml) {
    if (existsSync(path.join(outDir, name))) {
      ok(`out/${name} present (prerendered)`);
    } else {
      fail(`out/${name} missing — SPEC.md §8 route did not prerender to static HTML`);
    }
  }

  // Brand + OG assets referenced from src/app/layout.tsx metadata must
  // actually exist in the export, not just be referenced.
  const expectedBrandFiles = ["favicon.svg", "favicon-16.png", "favicon-32.png", "apple-touch-icon.png", "icon-maskable.svg", "og.png"];
  for (const name of expectedBrandFiles) {
    if (existsSync(path.join(outDir, "brand", name))) {
      ok(`out/brand/${name} present`);
    } else {
      fail(`out/brand/${name} missing — referenced from layout metadata but not in the export`);
    }
  }
}

process.exit(failed ? 1 : 0);
