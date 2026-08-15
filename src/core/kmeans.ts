import { mulberry32, type Rng } from "./rng";

/**
 * k-means, used STRICTLY as an internal scoring tool for the separation-gain
 * metric (SPEC.md §2) — it never drives a rendered position. Lloyd's
 * algorithm with k-means++ seeding, several restarts (lowest-inertia wins),
 * all driven by one seeded RNG so the whole computation is reproducible for
 * a fixed seed.
 */

function distance2(a: readonly number[], b: readonly number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += ((a[i] ?? 0) - (b[i] ?? 0)) ** 2;
  return sum;
}

function kmeansPlusPlusInit(points: number[][], k: number, rng: Rng): number[][] {
  const n = points.length;
  const centers: number[][] = [];
  const first = points[Math.floor(rng() * n)];
  if (first) centers.push(first.slice());

  const dist2ToNearest = new Float64Array(n).fill(Infinity);
  while (centers.length < k) {
    const lastCenter = centers[centers.length - 1];
    if (!lastCenter) break;
    let total = 0;
    for (let i = 0; i < n; i++) {
      const point = points[i];
      if (!point) continue;
      const d = distance2(point, lastCenter);
      if (d < (dist2ToNearest[i] ?? Infinity)) dist2ToNearest[i] = d;
      total += dist2ToNearest[i] ?? 0;
    }
    if (total <= 0) {
      // All remaining points coincide with an existing center; pick any point to keep k centers well-defined.
      const fallback = points[Math.floor(rng() * n)];
      if (fallback) centers.push(fallback.slice());
      continue;
    }
    let r = rng() * total;
    let chosen = points[n - 1] ?? [];
    for (let i = 0; i < n; i++) {
      r -= dist2ToNearest[i] ?? 0;
      if (r <= 0) {
        chosen = points[i] ?? [];
        break;
      }
    }
    centers.push(chosen.slice());
  }
  return centers;
}

function lloydIteration(points: number[][], centers: number[][]): { assignments: number[]; centers: number[][]; inertia: number } {
  const k = centers.length;
  const dims = points[0]?.length ?? 0;
  const assignments = new Array<number>(points.length).fill(0);
  let inertia = 0;

  for (let iter = 0; iter < 100; iter++) {
    let changed = false;
    let iterInertia = 0;
    for (let i = 0; i < points.length; i++) {
      const point = points[i];
      if (!point) continue;
      let best = 0;
      let bestDist = Infinity;
      for (let c = 0; c < k; c++) {
        const center = centers[c];
        if (!center) continue;
        const d = distance2(point, center);
        if (d < bestDist) {
          bestDist = d;
          best = c;
        }
      }
      if (assignments[i] !== best) changed = true;
      assignments[i] = best;
      iterInertia += bestDist;
    }
    inertia = iterInertia;

    const sums: number[][] = Array.from({ length: k }, () => new Array<number>(dims).fill(0));
    const counts = new Array<number>(k).fill(0);
    for (let i = 0; i < points.length; i++) {
      const c = assignments[i] ?? 0;
      const point = points[i];
      if (!point) continue;
      counts[c] = (counts[c] ?? 0) + 1;
      const sum = sums[c];
      if (!sum) continue;
      for (let d = 0; d < dims; d++) sum[d] = (sum[d] ?? 0) + (point[d] ?? 0);
    }
    for (let c = 0; c < k; c++) {
      const count = counts[c] ?? 0;
      if (count === 0) continue; // keep an empty cluster's center where it was rather than NaN-ing it
      const sum = sums[c];
      const center = centers[c];
      if (!sum || !center) continue;
      for (let d = 0; d < dims; d++) center[d] = sum[d]! / count;
    }

    if (!changed && iter > 0) break;
  }

  return { assignments, centers, inertia };
}

export interface KMeansResult {
  assignments: number[];
  centers: number[][];
  k: number;
}

export function kmeans(points: number[][], k: number, seed: number, restarts = 5): KMeansResult {
  const n = points.length;
  const effectiveK = Math.max(1, Math.min(k, n));
  if (n === 0) return { assignments: [], centers: [], k: effectiveK };

  const rng = mulberry32(seed);
  let best: { assignments: number[]; centers: number[][]; inertia: number } | null = null;
  for (let r = 0; r < restarts; r++) {
    const initial = kmeansPlusPlusInit(points, effectiveK, rng);
    const result = lloydIteration(points, initial);
    if (!best || result.inertia < best.inertia) best = result;
  }
  const finalResult = best ?? { assignments: new Array<number>(n).fill(0), centers: [points[0]?.slice() ?? []], inertia: 0 };
  return { assignments: finalResult.assignments, centers: finalResult.centers, k: effectiveK };
}
