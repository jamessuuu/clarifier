/**
 * SPEC.md §7: "Canvas2D/SVG static renderer (rung 3) + the accessible text
 * results panel." Also used, unchanged, as the live-animated draw call for
 * the WebGL2/WebGPU rungs' current milestone gap and for every rung's dev
 * loop before the capability ladder existed (M1) — the same draw function,
 * just called once (static) or every frame (animated), never a different
 * implementation per rung.
 */

export const INK = "#1A1712";
export const PAPER = "#FAF7F2";
export const AMBER = "#B45309";
export const RULE = "#E4DDD3";

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

const CATEGORY_PALETTE = [INK, "#3A5A8C", "#6B7A3A", "#7A4B8C", "#2E7A6B", "#8C5A2E"];

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
    ctx.globalAlpha = isOutlier ? 1 : 0.85;
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
