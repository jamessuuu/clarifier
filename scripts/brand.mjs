/**
 * Showcase-program brand generator — copied from
 * showcase-program/brand/brand.mjs (the ONE shared source across the
 * program's repos) and extended with clarifier's own glyph, following the
 * same conventions as the five phase-1 projects (sluice, snapgauge, chaff,
 * tiltmeter, dogwatch) so all six repos share one visual system.
 *
 * Why shared: each project inventing its own glyph language is how a brand
 * dies. The palette, grid, stroke weights and the dot-matrix face all come
 * from agentjames/scripts/branding/system.mjs (docs/DESIGN.md is the
 * binding contract). The chip mark is the maker's mark and is IDENTICAL
 * everywhere; only the project glyph differs.
 *
 * Deterministic by construction: no Math.random, no webfont, no network, no
 * date stamping. Same input, same bytes, forever — which is what lets CI
 * diff the output and fail on drift.
 *
 * Usage:  node scripts/brand.mjs --project=clarifier --out=<dir>
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// docs/DESIGN.md palette. Do not invent colours.
const PAPER = "#FAF7F2";
const INK = "#1A1712";
const AMBER = "#B45309";
const RULE = "#E4DDD3";

const G = 64; // every glyph is drawn on the same 64-unit grid

// ---------------------------------------------------------------------------
// 5x7 dot matrix — the house display face, generated not licensed.
// Ported from agentjames/scripts/branding/system.mjs, extended to the letters
// the project names need.
// ---------------------------------------------------------------------------
const FONT = {
  a: ["00000", "00000", "01110", "00001", "01111", "10001", "01111"],
  c: ["00000", "00000", "01111", "10000", "10000", "10000", "01111"],
  d: ["00001", "00001", "01111", "10001", "10001", "10001", "01111"],
  e: ["00000", "00000", "01110", "10001", "11111", "10000", "01110"],
  f: ["00110", "01001", "01000", "11100", "01000", "01000", "01000"],
  g: ["00000", "00000", "01111", "10001", "01111", "00001", "01110"],
  h: ["10000", "10000", "10110", "11001", "10001", "10001", "10001"],
  i: ["00100", "00000", "01100", "00100", "00100", "00100", "01110"],
  l: ["01100", "00100", "00100", "00100", "00100", "00100", "01110"],
  m: ["00000", "00000", "11010", "10101", "10101", "10101", "10101"],
  n: ["00000", "00000", "10110", "11001", "10001", "10001", "10001"],
  o: ["00000", "00000", "01110", "10001", "10001", "10001", "01110"],
  p: ["00000", "00000", "11110", "10001", "11110", "10000", "10000"],
  r: ["00000", "00000", "10110", "11001", "10000", "10000", "10000"],
  s: ["00000", "00000", "01111", "10000", "01110", "00001", "11110"],
  t: ["00100", "00100", "11111", "00100", "00100", "00101", "00010"],
  u: ["00000", "00000", "10001", "10001", "10001", "10011", "01101"],
  w: ["00000", "00000", "10001", "10001", "10101", "10101", "01010"],
};

function word(text, x0, y0, cell, fill, gap = 1) {
  const out = [];
  let cx = x0;
  for (const ch of text) {
    const g = FONT[ch];
    if (g) {
      g.forEach((row, ry) =>
        [...row].forEach((bit, rx) => {
          if (bit === "1") {
            out.push(
              `<rect x="${(cx + rx * cell).toFixed(2)}" y="${(y0 + ry * cell).toFixed(2)}" width="${cell}" height="${cell}" fill="${fill}"/>`
            );
          }
        })
      );
    }
    cx += cell * (5 + gap);
  }
  return { svg: out.join(""), end: cx - cell * gap };
}

// ---------------------------------------------------------------------------
// THE MAKER'S MARK — the agentjames chip. Identical in every repo.
// ---------------------------------------------------------------------------
function chip(ink = INK, amber = AMBER, { pins = 4, grid = G } = {}) {
  const out = [];
  const dieFrom = grid * 0.22;
  const dieSize = grid * 0.56;
  const pinLen = grid * 0.125;
  const pinW = grid * 0.047;
  const step = dieSize / (pins + 1);

  for (let i = 0; i < pins; i++) {
    const off = dieFrom + step * (i + 1) - pinW / 2;
    out.push(`<rect x="${grid * 0.09}" y="${off.toFixed(2)}" width="${pinLen}" height="${pinW}" fill="${ink}"/>`);
    out.push(`<rect x="${(grid - grid * 0.09 - pinLen).toFixed(2)}" y="${off.toFixed(2)}" width="${pinLen}" height="${pinW}" fill="${ink}"/>`);
    out.push(`<rect x="${off.toFixed(2)}" y="${grid * 0.09}" width="${pinW}" height="${pinLen}" fill="${ink}"/>`);
    out.push(`<rect x="${off.toFixed(2)}" y="${(grid - grid * 0.09 - pinLen).toFixed(2)}" width="${pinW}" height="${pinLen}" fill="${ink}"/>`);
  }
  out.push(
    `<rect x="${dieFrom}" y="${dieFrom}" width="${dieSize}" height="${dieSize}" fill="none" stroke="${ink}" stroke-width="${(grid * 0.047).toFixed(3)}"/>`
  );
  // the J: stem, turn, terminal
  out.push(
    `<path d="M${(grid * 0.59).toFixed(2)} ${(grid * 0.3265).toFixed(2)} V${(grid * 0.5559).toFixed(2)} a${(grid * 0.1231).toFixed(2)} ${(grid * 0.1231).toFixed(2)} 0 0 1 -${(grid * 0.1231).toFixed(2)} ${(grid * 0.1231).toFixed(2)} H${(grid * 0.4105).toFixed(2)}" fill="none" stroke="${ink}" stroke-width="${(grid * 0.062).toFixed(3)}" stroke-linecap="butt"/>`
  );
  // pin-1 marker, the single amber signal
  out.push(
    `<rect x="${(grid * 0.2705).toFixed(2)}" y="${(grid * 0.2705).toFixed(2)}" width="${(grid * 0.0728).toFixed(2)}" height="${(grid * 0.0728).toFixed(2)}" fill="${amber}"/>`
  );
  return out.join("");
}

// ---------------------------------------------------------------------------
// PROJECT GLYPHS — one per project, each drawn in the same language:
// ink strokes on the 64 grid, exactly ONE amber element, 0-2px radius,
// no gradients, no glow. Each concept is fixed by that project's SPEC.
// ---------------------------------------------------------------------------
const SW = (G * 0.047).toFixed(3); // standard stroke
const SWH = (G * 0.031).toFixed(3); // hairline

const GLYPHS = {
  /**
   * clarifier — a settling vessel (SPEC.md §14): a tapered tank, no other
   * phase-1 mark is a container shape. Three horizontal registers read
   * bottom-to-top exactly as the real industrial process runs: sediment
   * settled at the narrow draw-off, a turbulent/jumbled zone above it where
   * the input has not yet resolved, and the clarified layer at the rim where
   * separated, legible liquid overflows. THE AMBER ELEMENT sits only on that
   * top band — the moment jumbled input becomes separated and legible.
   */
  clarifier: () =>
    [
      // vessel — tapered tank, open top, narrow draw-off at the base
      `<path d="M9 12 H55 L45 54 H19 Z" fill="none" stroke="${INK}" stroke-width="${SW}"/>`,
      // sediment — settled, resting solid at the narrow base
      `<rect x="26" y="45" width="6" height="6" fill="${INK}"/>`,
      `<rect x="33" y="47" width="6" height="6" fill="${INK}"/>`,
      `<rect x="29" y="39" width="6" height="6" fill="${INK}"/>`,
      // the settling line — where sediment ends and the turbulent zone begins
      `<path d="M21 37 H43" fill="none" stroke="${INK}" stroke-width="${SWH}"/>`,
      // turbulent, unresolved zone — jumbled zigzag, still mixed
      `<path d="M15 27 L20 32 L25 25 L30 31 L35 24 L40 30 L45 25 L49 29" fill="none" stroke="${INK}" stroke-width="${SWH}"/>`,
      // THE CLARIFIED LAYER — amber, the top band at the rim: separated, legible
      `<rect x="10" y="15" width="44" height="6" fill="${AMBER}"/>`,
    ].join(""),

  /** sluice — a weir gate: channel walls, a raised sluice plate, one held item. */
  sluice: () =>
    [
      `<path d="M8 14 V50" fill="none" stroke="${INK}" stroke-width="${SW}"/>`,
      `<path d="M56 14 V50" fill="none" stroke="${INK}" stroke-width="${SW}"/>`,
      `<path d="M8 50 H56" fill="none" stroke="${INK}" stroke-width="${SW}"/>`,
      `<path d="M24 10 V26" fill="none" stroke="${INK}" stroke-width="${SWH}"/>`,
      `<path d="M40 10 V26" fill="none" stroke="${INK}" stroke-width="${SWH}"/>`,
      `<rect x="24" y="18" width="16" height="8" fill="none" stroke="${INK}" stroke-width="${SW}"/>`,
      `<rect x="44" y="40" width="6" height="6" fill="${INK}"/>`,
      `<rect x="34" y="40" width="6" height="6" fill="${INK}"/>`,
      `<rect x="14" y="40" width="6" height="6" fill="${AMBER}"/>`,
    ].join(""),

  snapgauge: () =>
    [
      `<path d="M12 14 V50" fill="none" stroke="${INK}" stroke-width="${(G * 0.078).toFixed(3)}"/>`,
      `<rect x="12" y="14" width="30" height="7" fill="${INK}"/>`,
      `<rect x="12" y="43" width="30" height="7" fill="${INK}"/>`,
      `<rect x="26" y="25" width="14" height="14" fill="none" stroke="${INK}" stroke-width="${SW}"/>`,
      `<path d="M50 21 H58" fill="none" stroke="${INK}" stroke-width="${SWH}"/>`,
      `<path d="M50 43 H58" fill="none" stroke="${INK}" stroke-width="${SWH}"/>`,
      `<rect x="29" y="21" width="8" height="5" fill="${AMBER}"/>`,
    ].join(""),

  chaff: () =>
    [
      `<path d="M6 44 H58" fill="none" stroke="${INK}" stroke-width="${SW}"/>`,
      `<rect x="10" y="36" width="7" height="7" fill="${INK}"/>`,
      `<rect x="20" y="36" width="7" height="7" fill="${INK}"/>`,
      `<rect x="30" y="36" width="7" height="7" fill="${INK}"/>`,
      `<rect x="40" y="36" width="7" height="7" fill="${INK}"/>`,
      `<rect x="38" y="24" width="5" height="5" fill="${INK}"/>`,
      `<rect x="46" y="17" width="4" height="4" fill="${INK}"/>`,
      `<rect x="53" y="10" width="4" height="4" fill="${AMBER}"/>`,
    ].join(""),

  tiltmeter: () =>
    [
      `<path d="M16 10 H48" fill="none" stroke="${INK}" stroke-width="${SW}"/>`,
      `<rect x="30" y="10" width="4" height="4" fill="${INK}"/>`,
      `<path d="M32 12 V50" fill="none" stroke="${RULE}" stroke-width="${SWH}" stroke-dasharray="3 3"/>`,
      `<path d="M32 12 L44 46" fill="none" stroke="${INK}" stroke-width="${SW}"/>`,
      `<path d="M44 46 l-4 0 l4 8 l4 -8 z" fill="${INK}"/>`,
      `<path d="M10 54 H54" fill="none" stroke="${INK}" stroke-width="${SWH}"/>`,
      `<path d="M32 44 A12 12 0 0 0 40 41" fill="none" stroke="${AMBER}" stroke-width="${SW}" stroke-linecap="butt"/>`,
    ].join(""),

  dogwatch: () =>
    [
      `<path d="M22 10 H42" fill="none" stroke="${INK}" stroke-width="${SW}"/>`,
      `<path d="M32 10 V16" fill="none" stroke="${INK}" stroke-width="${SW}"/>`,
      `<path d="M18 44 C18 26 22 16 32 16 C42 16 46 26 46 44 Z" fill="none" stroke="${INK}" stroke-width="${SW}" stroke-linejoin="miter"/>`,
      `<path d="M16 44 H48" fill="none" stroke="${INK}" stroke-width="${SW}"/>`,
      `<path d="M52 26 A14 14 0 0 1 52 40" fill="none" stroke="${INK}" stroke-width="${SWH}"/>`,
      `<rect x="29" y="44" width="6" height="8" fill="${AMBER}"/>`,
    ].join(""),
};

// ---------------------------------------------------------------------------
// COMPACT GLYPHS — purpose-drawn for 16-32px, not scaled-down full glyphs.
// Solid shapes, roughly tripled stroke weight, detail removed, the single
// amber element enlarged enough to survive. Each keeps exactly ONE amber
// element, same as its full sibling.
// ---------------------------------------------------------------------------
const COMPACT = {
  /**
   * clarifier — the tapered tank as a solid silhouette (no other project
   * glyph is a container, so the outline alone is already distinguishing at
   * 16px) with the sediment removed as detail and the top band solid amber —
   * a paper tank with an amber lid reads clearly at true small size.
   */
  clarifier: () =>
    [
      // tank body — solid ink, tapered
      `<path d="M8 10 H56 L46 56 H18 Z" fill="${INK}"/>`,
      // punch the interior back to paper, leaving a heavy tank wall
      `<path d="M14 16 H50 L42 50 H22 Z" fill="${PAPER}"/>`,
      // sediment, simplified to one solid rest at the base
      `<rect x="27" y="40" width="10" height="8" fill="${INK}"/>`,
      // THE CLARIFIED LAYER — amber, the lid at the rim
      `<rect x="8" y="10" width="48" height="9" fill="${AMBER}"/>`,
    ].join(""),

  sluice: () =>
    [
      `<rect x="10" y="8" width="44" height="11" fill="${INK}"/>`,
      `<rect x="10" y="8" width="9" height="22" fill="${INK}"/>`,
      `<rect x="45" y="8" width="9" height="22" fill="${INK}"/>`,
      `<rect x="10" y="50" width="44" height="8" fill="${INK}"/>`,
      `<rect x="24" y="32" width="16" height="14" fill="${AMBER}"/>`,
    ].join(""),

  snapgauge: () =>
    [
      `<rect x="8" y="12" width="9" height="40" fill="${INK}"/>`,
      `<rect x="8" y="12" width="40" height="10" fill="${INK}"/>`,
      `<rect x="8" y="42" width="40" height="10" fill="${INK}"/>`,
      `<rect x="30" y="24" width="14" height="9" fill="${AMBER}"/>`,
    ].join(""),

  chaff: () =>
    [
      `<rect x="6" y="42" width="52" height="8" fill="${INK}"/>`,
      `<rect x="10" y="28" width="11" height="11" fill="${INK}"/>`,
      `<rect x="25" y="28" width="11" height="11" fill="${INK}"/>`,
      `<rect x="40" y="28" width="11" height="11" fill="${INK}"/>`,
      `<rect x="44" y="8" width="13" height="13" fill="${AMBER}"/>`,
    ].join(""),

  tiltmeter: () =>
    [
      `<rect x="12" y="8" width="40" height="8" fill="${INK}"/>`,
      `<path d="M32 16 L44 44" stroke="${INK}" stroke-width="8" fill="none"/>`,
      `<rect x="10" y="50" width="44" height="6" fill="${INK}"/>`,
      `<rect x="38" y="38" width="14" height="14" fill="${AMBER}"/>`,
    ].join(""),

  dogwatch: () =>
    [
      `<rect x="26" y="6" width="12" height="8" fill="${INK}"/>`,
      `<path d="M14 44 C14 24 20 14 32 14 C44 14 50 24 50 44 Z" fill="${INK}"/>`,
      `<rect x="11" y="44" width="42" height="7" fill="${INK}"/>`,
      `<rect x="26" y="51" width="12" height="10" fill="${AMBER}"/>`,
    ].join(""),
};

// ---------------------------------------------------------------------------
// emit
// ---------------------------------------------------------------------------
function svg(w, h, inner, { bg = null, label = "Agent James" } = {}) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" role="img" aria-label="${label}">${
    bg ? `<rect width="${w}" height="${h}" fill="${bg}"/>` : ""
  }${inner}</svg>\n`;
}

async function main() {
  const args = Object.fromEntries(
    process.argv.slice(2).map((a) => {
      const [k, v] = a.replace(/^--/, "").split("=");
      return [k, v ?? true];
    })
  );
  const project = args.project;
  const outDir = args.out ?? "public/brand";
  if (!project || !GLYPHS[project]) {
    console.error(`brand.mjs: --project must be one of ${Object.keys(GLYPHS).join(", ")}`);
    process.exit(2);
  }

  mkdirSync(outDir, { recursive: true });
  const written = [];
  const put = (name, content) => {
    writeFileSync(join(outDir, name), content);
    written.push(name);
  };

  // The maker's mark, in both polarities and at both scales.
  put("mark.svg", svg(G, G, chip()));
  put("mark-inv.svg", svg(G, G, chip(PAPER, AMBER), { bg: INK }));
  put("mark-16.svg", svg(G, G, chip(INK, AMBER, { pins: 3 })));
  put("mark-16-inv.svg", svg(G, G, chip(PAPER, AMBER, { pins: 3 }), { bg: INK }));

  // The project glyph.
  const glyph = GLYPHS[project]();
  put("glyph.svg", svg(G, G, glyph, { label: project }));
  put("glyph-inv.svg", svg(G, G, GLYPHS[project]().replaceAll(INK, PAPER), { bg: INK, label: project }));

  // ── Icon family ───────────────────────────────────────────────────────────
  const compact = COMPACT[project]();

  put("favicon.svg", svg(G, G, compact, { bg: PAPER, label: `${project} icon` }));
  put("icon-compact.svg", svg(G, G, compact, { bg: PAPER, label: `${project} icon` }));
  put("icon-compact-inv.svg", svg(G, G, COMPACT[project]().replaceAll(INK, PAPER), { bg: INK, label: `${project} icon` }));

  const inset = 10;
  const scale = (G - inset * 2) / G;
  put(
    "icon-maskable.svg",
    svg(
      G,
      G,
      `<rect width="${G}" height="${G}" fill="${PAPER}"/><g transform="translate(${inset},${inset}) scale(${scale.toFixed(4)})">${compact}</g>`,
      { label: `${project} icon` }
    )
  );

  // Lockup: project glyph + wordmark, for the README header.
  const cell = 3.2;
  const w = word(project, 84, 30, cell, INK);
  const lockW = Math.ceil(w.end + 12);
  put(
    "lockup.svg",
    svg(
      lockW,
      64,
      `<g transform="translate(4,4) scale(0.87)">${glyph}</g>${w.svg}` +
        `<rect x="${(lockW - 10).toFixed(2)}" y="24" width="5.12" height="22.4" fill="${AMBER}"/>`,
      { label: `${project} — by Agent James` }
    )
  );

  // OG image: paper field, glyph, dot-matrix name, one amber rule. 1200x630.
  const ogWord = word(project, 96, 250, 12, INK);
  put(
    "og.svg",
    svg(
      1200,
      630,
      `<g transform="translate(96,96) scale(1.5)">${glyph}</g>` +
        ogWord.svg +
        `<rect x="96" y="330" width="${Math.min(1008, ogWord.end - 96).toFixed(0)}" height="6" fill="${AMBER}"/>` +
        `<g transform="translate(1040,470) scale(0.9)">${chip()}</g>`,
      { bg: PAPER, label: `${project} — Agent James` }
    )
  );

  // ── Raster sizes ──────────────────────────────────────────────────────────
  let sharp = null;
  try {
    ({ default: sharp } = await import("sharp"));
  } catch {
    /* optional */
  }

  if (sharp) {
    const raster = [
      ["favicon-16.png", 16, "icon-compact.svg"],
      ["favicon-32.png", 32, "icon-compact.svg"],
      ["favicon-48.png", 48, "icon-compact.svg"],
      ["apple-touch-icon.png", 180, "icon-maskable.svg"],
      ["icon-192.png", 192, "icon-maskable.svg"],
      ["icon-512.png", 512, "icon-maskable.svg"],
      ["og.png", null, "og.svg"],
    ];
    for (const [name, size, from] of raster) {
      const src = join(outDir, from);
      const img = sharp(src, { density: 384 });
      if (size) img.resize(size, size, { fit: "contain" });
      await img.png({ compressionLevel: 9 }).toFile(join(outDir, name));
      written.push(name);
    }
  } else {
    console.log("brand: sharp not resolvable — SVGs written, PNG sizes skipped");
  }

  console.log(`brand: ${project} -> ${outDir}`);
  for (const f of written) console.log(`  ${f}`);
}

await main();
