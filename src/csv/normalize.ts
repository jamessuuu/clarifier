/**
 * SPEC.md §3 Decision 2: rank/percentile normalization is the DEFAULT for
 * every numeric mapping, not min-max — this is what prevents "one point
 * becomes a black hole": an extreme outlier gets rank 1.0, same as any other
 * maximum, regardless of whether it is 2x or 200x the median. "raw" mode
 * (min-max) is the explicit, visitor-toggled opt-in for the exaggeration.
 * Missing values always land at rank 0.5 (median-rank strategy) — never 0,
 * which would silently pull every null toward one extreme.
 */

/** Fractional (tie-averaged) percentile rank in [0,1]. Missing -> 0.5. */
export function rankNormalize(values: readonly (number | null)[]): Float32Array {
  const n = values.length;
  const out = new Float32Array(n).fill(0.5);
  const indexed: { i: number; v: number }[] = [];
  for (let i = 0; i < n; i++) {
    const v = values[i];
    if (v !== null && v !== undefined && Number.isFinite(v)) indexed.push({ i, v });
  }
  const m = indexed.length;
  if (m === 0) return out;
  if (m === 1) {
    const only = indexed[0];
    if (only) out[only.i] = 0.5;
    return out;
  }
  indexed.sort((a, b) => a.v - b.v);
  let idx = 0;
  while (idx < m) {
    let j = idx;
    while (j + 1 < m) {
      const next = indexed[j + 1];
      const cur = indexed[idx];
      if (next && cur && next.v === cur.v) j++;
      else break;
    }
    const avgRank = (idx + j) / 2;
    const rank01 = avgRank / (m - 1);
    for (let k = idx; k <= j; k++) {
      const entry = indexed[k];
      if (entry) out[entry.i] = rank01;
    }
    idx = j + 1;
  }
  return out;
}

/** Min-max to [0,1] — the "raw" opt-in that preserves outlier exaggeration. Missing -> 0.5. */
export function minMaxNormalize(values: readonly (number | null)[]): Float32Array {
  const n = values.length;
  const out = new Float32Array(n).fill(0.5);
  let min = Infinity;
  let max = -Infinity;
  for (const v of values) {
    if (v !== null && v !== undefined && Number.isFinite(v)) {
      if (v < min) min = v;
      if (v > max) max = v;
    }
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) return out;
  const range = max - min;
  for (let i = 0; i < n; i++) {
    const v = values[i];
    if (v === null || v === undefined || !Number.isFinite(v)) {
      out[i] = 0.5;
      continue;
    }
    out[i] = range > 0 ? (v - min) / range : 0.5;
  }
  return out;
}

export interface CategoricalEncoding {
  values01: Float32Array; // ordinal position / (k-1), in [0,1]; missing -> 0.5
  charge: Float32Array; // evenly spread in [-1,1] by first-appearance order; missing -> 0 (neutral)
  categories: string[]; // in first-appearance order
}

/** First-appearance order (deterministic given fixed input, no locale-sensitive sort). */
export function encodeCategorical(values: readonly (string | null)[]): CategoricalEncoding {
  const categories: string[] = [];
  const index = new Map<string, number>();
  for (const v of values) {
    if (v !== null && !index.has(v)) {
      index.set(v, categories.length);
      categories.push(v);
    }
  }
  const k = categories.length;
  const values01 = new Float32Array(values.length);
  const charge = new Float32Array(values.length);
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v === null || v === undefined) {
      values01[i] = 0.5;
      charge[i] = 0;
      continue;
    }
    const idx = index.get(v) ?? 0;
    values01[i] = k > 1 ? idx / (k - 1) : 0.5;
    charge[i] = k > 1 ? (2 * idx) / (k - 1) - 1 : 0;
  }
  return { values01, charge, categories };
}

export function normalizeNumericColumn(values: readonly (number | null)[], mode: "rank" | "raw"): Float32Array {
  return mode === "raw" ? minMaxNormalize(values) : rankNormalize(values);
}
