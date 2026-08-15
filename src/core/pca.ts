/**
 * Top-2 principal components via power iteration + deflation — sufficient
 * for the "best-achievable 2-axis view" SPEC.md §2 needs, without pulling in
 * a linear-algebra dependency for a handful of mapped columns (d is
 * typically single digits). No RNG: power iteration is seeded from a fixed,
 * non-degenerate starting vector, so PCA itself needs no seed parameter —
 * only k-means (the scoring step downstream) does.
 */

function matMulVec(cov: Float64Array, d: number, v: Float64Array): Float64Array {
  const out = new Float64Array(d);
  for (let i = 0; i < d; i++) {
    let sum = 0;
    for (let j = 0; j < d; j++) sum += (cov[i * d + j] ?? 0) * (v[j] ?? 0);
    out[i] = sum;
  }
  return out;
}

function norm(v: Float64Array): number {
  let s = 0;
  for (const x of v) s += x * x;
  return Math.sqrt(s);
}

function normalize(v: Float64Array): Float64Array {
  const n = norm(v) || 1;
  return v.map((x) => x / n);
}

function dot(a: Float64Array, b: Float64Array): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += (a[i] ?? 0) * (b[i] ?? 0);
  return s;
}

/** Dominant eigenvector + eigenvalue of a symmetric d x d matrix via power iteration. */
function dominantEigenpair(cov: Float64Array, d: number, iterations = 300): { vector: Float64Array; value: number } {
  // Start from an all-ones-ish, non-degenerate vector (deterministic, no RNG needed).
  let v = normalize(Float64Array.from({ length: d }, (_, i) => 1 + i * 0.0137));
  for (let it = 0; it < iterations; it++) {
    const next = matMulVec(cov, d, v);
    const n = norm(next);
    if (n < 1e-12) break; // matrix ~0 in this direction; keep the last valid vector
    v = next.map((x) => x / n);
  }
  const value = dot(v, matMulVec(cov, d, v));
  return { vector: v, value };
}

export interface PcaResult {
  /** n x 2 flattened: [x0,y0, x1,y1, ...] projections onto the top-2 components. */
  projected: Float64Array;
  varianceExplained: [number, number];
  dims: number;
}

/**
 * `columns` is column-major: columns[c] is a Float32Array of length n for
 * mapped numeric column c, already normalized (rank or raw per its own
 * ColumnMapping — SPEC.md §2 "the mapped numeric columns", using whatever
 * normalization each was configured with).
 */
export function computePca2D(columns: readonly Float32Array[], n: number): PcaResult {
  const d = columns.length;
  if (d === 0 || n === 0) {
    return { projected: new Float64Array(0), varianceExplained: [0, 0], dims: 0 };
  }

  // Center each column (mean 0) — SPEC.md's rank/min-max normalization
  // already bounds every column to a comparable range, so no separate
  // z-score/variance-scaling step is needed before covariance.
  const means = new Float64Array(d);
  for (let c = 0; c < d; c++) {
    let sum = 0;
    const col = columns[c];
    if (!col) continue;
    for (let i = 0; i < n; i++) sum += col[i] ?? 0;
    means[c] = sum / n;
  }

  const centered = new Float64Array(n * d);
  for (let c = 0; c < d; c++) {
    const col = columns[c];
    if (!col) continue;
    const mean = means[c] ?? 0;
    for (let i = 0; i < n; i++) centered[i * d + c] = (col[i] ?? 0) - mean;
  }

  // Covariance matrix (d x d).
  const cov = new Float64Array(d * d);
  for (let a = 0; a < d; a++) {
    for (let b = a; b < d; b++) {
      let sum = 0;
      for (let i = 0; i < n; i++) sum += (centered[i * d + a] ?? 0) * (centered[i * d + b] ?? 0);
      const value = n > 1 ? sum / (n - 1) : 0;
      cov[a * d + b] = value;
      cov[b * d + a] = value;
    }
  }

  const pc1 = dominantEigenpair(cov, d);

  let pc2Vector: Float64Array;
  let pc2Value: number;
  if (d === 1) {
    pc2Vector = new Float64Array([0]);
    pc2Value = 0;
  } else {
    // Deflate: cov' = cov - value1 * v1 v1^T, then find its dominant eigenvector.
    const deflated = new Float64Array(d * d);
    for (let a = 0; a < d; a++) {
      for (let b = 0; b < d; b++) {
        deflated[a * d + b] = (cov[a * d + b] ?? 0) - pc1.value * (pc1.vector[a] ?? 0) * (pc1.vector[b] ?? 0);
      }
    }
    const pc2 = dominantEigenpair(deflated, d);
    // Re-orthogonalize against pc1 to guard against numerical drift.
    const proj = dot(pc2.vector, pc1.vector);
    const orthogonal = pc2.vector.map((x, i) => x - proj * (pc1.vector[i] ?? 0));
    pc2Vector = normalize(orthogonal);
    pc2Value = Math.max(0, pc2.value);
  }

  const projected = new Float64Array(n * 2);
  for (let i = 0; i < n; i++) {
    let x = 0;
    let y = 0;
    for (let c = 0; c < d; c++) {
      const value = centered[i * d + c] ?? 0;
      x += value * (pc1.vector[c] ?? 0);
      y += value * (pc2Vector[c] ?? 0);
    }
    projected[i * 2] = x;
    projected[i * 2 + 1] = y;
  }

  const totalVariance = (() => {
    let s = 0;
    for (let a = 0; a < d; a++) s += cov[a * d + a] ?? 0;
    return s || 1;
  })();

  return {
    projected,
    varianceExplained: [pc1.value / totalVariance, pc2Value / totalVariance],
    dims: d,
  };
}
