/**
 * Standard silhouette score (Rousseeuw 1987). O(n^2) — fine at the
 * separation-gain metric's own sample cap (2000 rows, docs/limitations),
 * not fine at the full 50,000-row WebGPU render budget, which is exactly
 * why that cap exists.
 */
function euclidean(a: readonly number[], b: readonly number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += ((a[i] ?? 0) - (b[i] ?? 0)) ** 2;
  return Math.sqrt(sum);
}

/** Returns the mean silhouette score across all points, and each point's own score. */
export function silhouetteScore(points: readonly (readonly number[])[], assignments: readonly number[], k: number): { mean: number; perPoint: Float64Array } {
  const n = points.length;
  const perPoint = new Float64Array(n);
  if (n === 0 || k <= 1) return { mean: 0, perPoint };

  const byCluster: number[][] = Array.from({ length: k }, () => []);
  assignments.forEach((c, i) => {
    const arr = byCluster[c];
    if (arr) arr.push(i);
  });

  for (let i = 0; i < n; i++) {
    const own = assignments[i] ?? 0;
    const ownCluster = byCluster[own] ?? [];
    const pointI = points[i];
    if (!pointI) continue;

    // a(i): mean distance to other points in the same cluster.
    let a = 0;
    if (ownCluster.length > 1) {
      let sum = 0;
      for (const j of ownCluster) {
        if (j === i) continue;
        const pointJ = points[j];
        if (pointJ) sum += euclidean(pointI, pointJ);
      }
      a = sum / (ownCluster.length - 1);
    }

    // b(i): lowest mean distance to any OTHER cluster's points.
    let b = Infinity;
    for (let c = 0; c < k; c++) {
      if (c === own) continue;
      const other = byCluster[c];
      if (!other || other.length === 0) continue;
      let sum = 0;
      for (const j of other) {
        const pointJ = points[j];
        if (pointJ) sum += euclidean(pointI, pointJ);
      }
      const meanDist = sum / other.length;
      if (meanDist < b) b = meanDist;
    }
    if (!Number.isFinite(b)) b = 0; // no other non-empty cluster exists

    const denom = Math.max(a, b);
    perPoint[i] = denom > 0 ? (b - a) / denom : 0;
  }

  let sum = 0;
  for (let i = 0; i < n; i++) sum += perPoint[i] ?? 0;
  return { mean: n > 0 ? sum / n : 0, perPoint };
}
