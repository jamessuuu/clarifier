// Minimal, dependency-free static file server for `out/` (the
// `output: "export"` build) — used by Playwright's `webServer` in CI and
// locally. `output: "export"` has no server to `next start`, so e2e against
// the real build needs something to serve the plain static files with
// Next's "clean URL" convention (a request for "/docs" serves "docs.html";
// "/docs/quickstart" serves "docs/quickstart.html"; unmatched paths serve
// "404.html"). No third-party dependency.
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const outDir = fileURLToPath(new URL("../out", import.meta.url));
const port = Number(process.env.PORT ?? 4173);

const CONTENT_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".csv": "text/csv; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webm": "video/webm",
  ".wasm": "application/wasm",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".webmanifest": "application/manifest+json",
};

async function fileExists(p) {
  try {
    return (await stat(p)).isFile();
  } catch {
    return false;
  }
}

async function resolvePath(urlPath) {
  const decoded = decodeURIComponent(urlPath.split("?")[0] ?? "/");
  const safe = path.normalize(decoded).replace(/^(\.\.[/\\])+/, "");
  const candidates =
    safe === "/" || safe === ""
      ? [path.join(outDir, "index.html")]
      : [path.join(outDir, safe), `${path.join(outDir, safe)}.html`, path.join(outDir, safe, "index.html")];
  for (const candidate of candidates) {
    if (await fileExists(candidate)) return candidate;
  }
  return null;
}

const server = createServer((req, res) => {
  void (async () => {
    const found = await resolvePath(req.url ?? "/");
    const servePath = found ?? path.join(outDir, "404.html");
    const status = found ? 200 : 404;
    try {
      const body = await readFile(servePath);
      const ext = path.extname(servePath);
      res.writeHead(status, { "Content-Type": CONTENT_TYPES[ext] ?? "application/octet-stream" });
      res.end(body);
    } catch {
      res.writeHead(500);
      res.end("serve-out: internal error");
    }
  })();
});

server.listen(port, () => {
  console.log(`serve-out: http://localhost:${String(port)} -> ${outDir}`);
});
