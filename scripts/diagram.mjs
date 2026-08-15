/**
 * The mechanism diagram (showcase-program/DESIGN-DIRECTION.md §2: "each
 * project has exactly one idea that a diagram explains faster than prose").
 * For clarifier that idea is the column -> force -> visible-effect chain
 * (SPEC.md §11) — the same four rows already described in the image alt
 * text on /docs/concept.
 *
 * House line language: same 64-unit grid convention as scripts/brand.mjs's
 * glyphs, ink strokes only, exactly ONE amber element (the finding band —
 * the moment physics output becomes a checkable claim, same role amber
 * plays in every other phase-1 project's diagram), no gradients, no drop
 * shadows, no rounded "friendly" corners. Deterministic: no Math.random, no
 * webfont, no network. Text uses the same generated (not licensed)
 * dot-matrix face as brand.mjs, extended here with one more letter ("v",
 * needed for "viscosity"/"visible" — not in brand.mjs's own alphabet, which
 * never needed it).
 *
 * Usage: node scripts/diagram.mjs --out=<dir>
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const PAPER = "#FAF7F2";
const INK = "#1A1712";
const AMBER = "#B45309";
const RULE = "#E4DDD3";

const SW = 3; // standard stroke, px
const SWH = 2; // hairline stroke, px

// ---------------------------------------------------------------------------
// Dot-matrix face — ported verbatim from scripts/brand.mjs, plus "v" (that
// file's alphabet never needed it; this diagram's labels do).
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
  v: ["00000", "00000", "10001", "10001", "10001", "01010", "00100"],
  w: ["00000", "00000", "10001", "10001", "10101", "10101", "01010"],
  b: ["10000", "10000", "11110", "10001", "10001", "10001", "11110"],
  y: ["00000", "00000", "10001", "10001", "01111", "00001", "01110"],
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
            out.push(`<rect x="${(cx + rx * cell).toFixed(2)}" y="${(y0 + ry * cell).toFixed(2)}" width="${cell}" height="${cell}" fill="${fill}"/>`);
          }
        })
      );
    }
    cx += cell * (5 + gap);
  }
  return { svg: out.join(""), end: cx - cell * gap };
}

function wordWidth(text, cell, gap = 1) {
  return text.length * cell * (5 + gap) - cell * gap;
}

function centeredWord(text, cx, y0, cell, fill) {
  const w = wordWidth(text, cell);
  return word(text, cx - w / 2, y0, cell, fill).svg;
}

// ---------------------------------------------------------------------------
// Small line-art icons, ink strokes only, no fill except ink accents.
// ---------------------------------------------------------------------------
function columnIcon(x, y, kind) {
  const w = 30;
  const h = 30;
  const out = [`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="${INK}" stroke-width="${SW}"/>`];
  if (kind === "numeric") {
    // three horizontal hairlines — an ordered run of values
    for (const dy of [8, 15, 22]) {
      out.push(`<path d="M${x + 6} ${y + dy} H${x + w - 6}" stroke="${INK}" stroke-width="${SWH}"/>`);
    }
  } else {
    // three filled squares at different rows — discrete, unordered categories
    for (const [dx, dy] of [
      [7, 7],
      [16, 15],
      [8, 22],
    ]) {
      out.push(`<rect x="${x + dx}" y="${y + dy}" width="5" height="5" fill="${INK}"/>`);
    }
  }
  return out.join("");
}

/** A horizontal arrow, hand-drawn (no SVG marker defs, matching the rest of the house style). */
function arrow(x1, x2, y) {
  return [
    `<path d="M${x1} ${y} H${x2 - 8}" stroke="${INK}" stroke-width="${SWH}"/>`,
    `<path d="M${x2 - 10} ${y - 4} L${x2} ${y} L${x2 - 10} ${y + 4} Z" fill="${INK}"/>`,
  ].join("");
}

function svgDoc(w, h, inner, title, desc) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" role="img" aria-labelledby="dTitle dDesc"><title id="dTitle">${title}</title><desc id="dDesc">${desc}</desc><rect width="${w}" height="${h}" fill="${PAPER}"/>${inner}</svg>\n`;
}

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------
const WIDTH = 1100;
const HEIGHT = 460;

const COL1_X = 24; // column icon + label
const COL2_X = 340; // force box
const COL3_X = 560; // visible-effect text
const RIGHT_X = 1076;
const ROW_TOP = 68;
const ROW_H = 72;

const ROWS = [
  { columnKind: "numeric", columnLabel: "numeric column", force: "mass", effect: "pulls toward center" },
  { columnKind: "categorical", columnLabel: "categorical column", force: "charge", effect: "groups repel or attract" },
  { columnKind: "numeric", columnLabel: "second numeric column", force: "attraction", effect: "similar rows pull together" },
  { columnKind: "categorical", columnLabel: "categorical column", force: "viscosity", effect: "damps speed slower groups" },
];

function build() {
  const out = [];

  // Section headers
  out.push(centeredWord("column", COL1_X + 90, 22, 3.4, INK));
  out.push(centeredWord("force", (COL2_X + 520) / 2, 22, 3.4, INK));
  out.push(centeredWord("visible effect", (COL3_X + RIGHT_X) / 2, 22, 3.4, INK));
  out.push(`<path d="M${COL1_X} 44 H${RIGHT_X}" stroke="${RULE}" stroke-width="1"/>`);

  ROWS.forEach((row, i) => {
    const y = ROW_TOP + i * ROW_H;
    const yc = y + 15;

    const labelX = COL1_X + 40;
    const ARROW1_START = 316; // fixed, so every row's arrow is the same length
    const labelBudget = ARROW1_START - 6 - labelX; // px available before the arrow
    // Cell size shrinks only for labels that need it ("second numeric
    // column" is nearly 1.5x "numeric column") — capped at 2.3 so short
    // labels don't balloon. Computed from the label's own character count,
    // not a fixed guess: an earlier fixed cell size let the longest label
    // run straight through the arrow into the force box, caught by
    // rendering and looking at it, not assumed correct.
    const labelCell = Math.min(2.3, labelBudget / (row.columnLabel.length * 6 - 1));
    out.push(columnIcon(COL1_X, y, row.columnKind));
    out.push(word(row.columnLabel, labelX, y + 4, labelCell, INK).svg);
    out.push(arrow(ARROW1_START, COL2_X, yc));

    const boxW = 180;
    out.push(`<rect x="${COL2_X}" y="${y}" width="${boxW}" height="30" fill="none" stroke="${INK}" stroke-width="${SW}"/>`);
    out.push(centeredWord(row.force, COL2_X + boxW / 2, y + 8, 2.9, INK));

    out.push(arrow(COL2_X + boxW + 20, COL3_X, yc));

    out.push(word(row.effect, COL3_X, y + 8, 3, INK).svg);

    if (i < ROWS.length - 1) {
      out.push(`<path d="M${COL1_X} ${y + ROW_H - 12} H${RIGHT_X}" stroke="${RULE}" stroke-width="1"/>`);
    }
  });

  // THE FINDING — the one amber element: physics output becomes a checkable
  // claim, not merely a picture. Same role amber plays in every other
  // phase-1 diagram (the fail-closed edge, the risky tier, the dropped
  // band, the cannot-attribute verdict, the REFUSED edge).
  const bandY = ROW_TOP + ROWS.length * ROW_H + 16;
  const bandH = 96;
  out.push(`<rect x="${COL1_X}" y="${bandY}" width="${RIGHT_X - COL1_X}" height="${bandH}" fill="none" stroke="${AMBER}" stroke-width="${SW}"/>`);
  out.push(centeredWord("the visible effect is the finding", WIDTH / 2, bandY + 22, 3.3, AMBER));
  out.push(centeredWord("clusters separation or interpenetration", WIDTH / 2, bandY + 52, 3.3, AMBER));

  return out.join("");
}

async function main() {
  const args = Object.fromEntries(
    process.argv.slice(2).map((a) => {
      const [k, v] = a.replace(/^--/, "").split("=");
      return [k, v ?? true];
    })
  );
  const outDir = args.out ?? "public/diagram";
  mkdirSync(outDir, { recursive: true });

  const title = "How clarifier turns CSV columns into a settled, honest layout";
  const desc =
    "Four rows, each column type mapped to a force and its visible effect: a numeric column maps to mass and pulls toward the composition center; a categorical column maps to charge and its groups repel or attract; a second numeric column maps to attraction and similar rows pull together; a further categorical column maps to viscosity, damping speed into slower-moving groups. The combined visible effect -- clusters, separation, or interpenetration -- is the finding, highlighted in amber because it is the one output this tool has to get honest, not merely pretty.";

  const svg = svgDoc(WIDTH, HEIGHT, build(), title, desc);
  writeFileSync(join(outDir, "mechanism.svg"), svg);
  console.log(`diagram: wrote mechanism.svg -> ${outDir}`);
}

await main();
