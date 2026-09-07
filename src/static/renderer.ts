/**
 * SPEC.md §7: "Canvas2D/SVG static renderer (rung 3) + the accessible text
 * results panel." Also used, unchanged, as the live-animated draw call for
 * the WebGL2/WebGPU rungs' current milestone gap and for every rung's dev
 * loop before the capability ladder existed (M1) — the same draw function,
 * just called once (static) or every frame (animated), never a different
 * implementation per rung.
 */

/*
 * The plot's own palette. These were cream + near-black to match the page's
 * daylight lighting; the page is dusk as of 2026-09-07 and these follow it,
 * so the canvas is not a lit rectangle punched into a dark page. The names
 * are unchanged (INK is "the mark colour", PAPER is "the plot ground") and
 * every consumer keeps working.
 *
 * Measured with the WCAG relative-luminance formula against PAPER:
 *   INK #E8ECF3 14.99:1, and every category below clears 6.6:1, so no
 *   cluster colour is ever the weakest thing on the plot.
 */
export const INK = "#E8ECF3";
export const PAPER = "#141821";
export const AMBER = "#F2A14B";
export const RULE = "#2A3140";

export interface Viewport {
  width: number;
  height: number;
  scale: number;
  offsetX: number;
  offsetY: number;
}

/** Fits the current bounding box to the canvas with padding — recomputed every call so the camera follows the layout as it settles. */
export function computeViewport(positions: Float32Array, n: number, width: number, height: number, padding = 0.12): Viewport {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < n; i++) {
    const x = positions[i * 2] ?? 0;
    const y = positions[i * 2 + 1] ?? 0;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  if (!Number.isFinite(minX) || n === 0) {
    return { width, height, scale: 1, offsetX: width / 2, offsetY: height / 2 };
  }
  const spanX = Math.max(maxX - minX, 1e-3);
  const spanY = Math.max(maxY - minY, 1e-3);
  const usableW = width * (1 - padding * 2);
  const usableH = height * (1 - padding * 2);
  const scale = Math.min(usableW / spanX, usableH / spanY);
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  return { width, height, scale, offsetX: width / 2 - cx * scale, offsetY: height / 2 - cy * scale };
}

export function worldToScreen(vp: Viewport, x: number, y: number): [number, number] {
  return [x * vp.scale + vp.offsetX, y * vp.scale + vp.offsetY];
}

export interface DrawOptions {
  positions: Float32Array;
  n: number;
  width: number;
  height: number;
  /** Optional per-point category index for coloring (e.g. the charge-mapped column's categories); -1 or omitted = default ink. */
  categoryOf?: ((i: number) => number) | undefined;
  /** Row indices to render as outliers (amber ring) — SPEC.md §2/§11 outlier finding. */
  outlierRowSet?: ReadonlySet<number> | undefined;
  pointRadius?: number;
}

/* Six categorical hues for the charge-mapped column, lifted for a dark
   ground. Lowest contrast against PAPER is #F2779B at 6.67:1. */
const CATEGORY_PALETTE = ["#7FB2F0", "#7BD88F", "#C79BF0", "#5FD3BC", "#F2A14B", "#F2779B"];

export function drawFrame(ctx: CanvasRenderingContext2D, opts: DrawOptions): Viewport {
  const { positions, n, width, height, categoryOf, outlierRowSet, pointRadius = 3.2 } = opts;
  ctx.save();
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, width, height);

  const vp = computeViewport(positions, n, width, height);

  for (let i = 0; i < n; i++) {
    const x = positions[i * 2] ?? 0;
    const y = positions[i * 2 + 1] ?? 0;
    const [sx, sy] = worldToScreen(vp, x, y);
    const isOutlier = outlierRowSet?.has(i) ?? false;
    const category = categoryOf ? categoryOf(i) : -1;
    const fill = category >= 0 ? (CATEGORY_PALETTE[category % CATEGORY_PALETTE.length] ?? INK) : INK;

    ctx.beginPath();
    ctx.arc(sx, sy, pointRadius, 0, Math.PI * 2);
    ctx.fillStyle = fill;
    ctx.globalAlpha = isOutlier ? 1 : 0.82;
    ctx.fill();

    if (isOutlier) {
      ctx.globalAlpha = 1;
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = AMBER;
      ctx.beginPath();
      ctx.arc(sx, sy, pointRadius + 3, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
  ctx.restore();
  return vp;
}
