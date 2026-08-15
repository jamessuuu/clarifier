import { kmeans } from "./kmeans";

export interface NamedNumericColumn {
  name: string;
  /** Raw (unnormalized) values, null = missing — used for human-readable ranges, not force math. */
  rawValues: (number | null)[];
}

export interface ClusterSummary {
  index: number;
  size: number;
  /** Up to 2 columns whose within-cluster mean deviates most from the overall mean, with the cluster's own raw value range on that column. */
  definingColumns: { name: string; min: number; max: number }[];
}

export interface ResultsAnalysis {
  clusterCount: number;
  clusters: ClusterSummary[];
  outlierRowIndices: number[];
}

/**
 * SPEC.md §11: "a real HTML results panel... states, generated from the same
 * numbers the physics view computes: cluster count found, the defining
 * columns and value ranges of the largest clusters, the outlier row count
 * and which rows." Runs k-means on the FINAL SETTLED PHYSICS POSITIONS
 * (never a separate model) at the same k the separation-gain metric already
 * settled on, so a screen-reader visitor gets the identical finding a
 * sighted visitor sees in the canvas, not a second opinion.
 */
export function analyzeResults(positions: Float32Array, n: number, k: number, columns: readonly NamedNumericColumn[]): ResultsAnalysis {
  if (n === 0 || k < 1) return { clusterCount: 0, clusters: [], outlierRowIndices: [] };

  const points = Array.from({ length: n }, (_, i) => [positions[i * 2] ?? 0, positions[i * 2 + 1] ?? 0]);
  const { assignments, k: effectiveK } = kmeans(points, k, 20260809);

  const byCluster: number[][] = Array.from({ length: effectiveK }, () => []);
  assignments.forEach((c, i) => {
    const arr = byCluster[c];
    if (arr) arr.push(i);
  });

  const overallMeans = columns.map((col) => {
    const nums = col.rawValues.filter((v): v is number => v !== null && Number.isFinite(v));
    return nums.length > 0 ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
  });

  const clusters: ClusterSummary[] = byCluster
    .map((indices, index) => {
      const deviations = columns.map((col, ci) => {
        const values = indices.map((i) => col.rawValues[i]).filter((v): v is number => v !== null && Number.isFinite(v));
        if (values.length === 0) return { name: col.name, min: 0, max: 0, deviation: 0 };
        const mean = values.reduce((a, b) => a + b, 0) / values.length;
        const overall = overallMeans[ci] ?? 0;
        return { name: col.name, min: Math.min(...values), max: Math.max(...values), deviation: Math.abs(mean - overall) };
      });
      const definingColumns = deviations
        .slice()
        .sort((a, b) => b.deviation - a.deviation)
        .slice(0, 2)
        .map(({ name, min, max }) => ({ name, min, max }));
      return { index, size: indices.length, definingColumns };
    })
    .filter((c) => c.size > 0)
    .sort((a, b) => b.size - a.size);

  const outlierRowIndices = findOutliersByNearestNeighborDistance(points);

  return { clusterCount: clusters.length, clusters, outlierRowIndices };
}

/**
 * A point is an outlier if its distance to its single nearest OTHER point is
 * unusually large (z-score > 2 against the dataset's own nearest-neighbor
 * distance distribution) — density-based, not cluster-assignment-based.
 * Deliberately NOT "distance to own cluster centroid" or "own-cluster
 * silhouette": k-means often isolates a genuinely far-away point into a
 * SINGLETON cluster of its own, where both of those alternatives trivially
 * read as "perfectly fits its cluster" (nothing else is in it to compare
 * against) — exactly backwards for an outlier detector. Nearest-neighbor
 * distance has no such blind spot: an isolated point is still far from
 * every OTHER point regardless of which cluster label it was given.
 *
 * O(n^2); capped at OUTLIER_DETECTION_SAMPLE_CAP points for the same reason
 * separation-gain caps its own silhouette computation (core/separation-
 * gain.ts) — this is an accessibility/results-panel feature, not the
 * physics or the rendered layout, so a large dataset's outlier list is
 * computed on a deterministic prefix rather than blocking the main thread.
 */
const OUTLIER_DETECTION_SAMPLE_CAP = 3000;

function findOutliersByNearestNeighborDistance(points: readonly number[][]): number[] {
  const n = points.length;
  if (n < 3) return [];
  const capped = Math.min(n, OUTLIER_DETECTION_SAMPLE_CAP);

  const nearestDist = new Float64Array(capped);
  for (let i = 0; i < capped; i++) {
    let best = Infinity;
    const pi = points[i];
    if (!pi) continue;
    for (let j = 0; j < capped; j++) {
      if (i === j) continue;
      const pj = points[j];
      if (!pj) continue;
      const d = Math.hypot((pi[0] ?? 0) - (pj[0] ?? 0), (pi[1] ?? 0) - (pj[1] ?? 0));
      if (d < best) best = d;
    }
    nearestDist[i] = best;
  }

  const mean = nearestDist.reduce((a, b) => a + b, 0) / capped;
  const variance = nearestDist.reduce((a, b) => a + (b - mean) ** 2, 0) / capped;
  const stddev = Math.sqrt(variance);
  if (stddev <= 1e-9) return [];

  const threshold = mean + 2 * stddev;
  const outliers: number[] = [];
  for (let i = 0; i < capped; i++) {
    if ((nearestDist[i] ?? 0) > threshold) outliers.push(i);
  }
  return outliers;
}
