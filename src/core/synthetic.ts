import { mulberry32, rngGaussian, rngRange, type Rng } from "./rng";

/**
 * The committed, seeded synthetic-data generator SPEC.md §10.2 and §13 both
 * point at — ONE implementation so the bundled sample dataset and the CI
 * golden fixtures can never silently drift from each other. Pure, isomorphic
 * (no DOM, no Node I/O): scripts/gen-samples.mjs and evals/*.eval.test.ts
 * both import this module directly rather than each re-deriving the shape.
 */
export type SyntheticRow = Record<string, string | number>;

function round(n: number, decimals: number): number {
  const f = Math.pow(10, decimals);
  return Math.round(n * f) / f;
}

export interface LabeledSynthetic {
  /** CSV-mappable columns ONLY (id + numeric dims) — deliberately excludes the ground-truth label, so physics must find structure from numeric columns alone, not be handed the answer as a charge mapping. */
  rows: SyntheticRow[];
  /** Ground truth, kept separate from `rows` on purpose — used only by evals to verify what physics found, never fed into the mapping pipeline. */
  labels: string[];
}

/** blobs-3-known (SPEC.md §13): 3 Gaussian clusters in 5 numeric dimensions, ground truth = 3. */
export function generateBlobs3Known(seed: number, rowsPerCluster = 60): LabeledSynthetic {
  const rng = mulberry32(seed);
  const centers: number[][] = [
    [0, 0, 0, 0, 0],
    [9, 9, -7, 4, 6],
    [-9, 7, 8, -5, -4],
  ];
  const rows: SyntheticRow[] = [];
  const labels: string[] = [];
  for (let c = 0; c < centers.length; c++) {
    const center = centers[c];
    if (!center) continue;
    for (let r = 0; r < rowsPerCluster; r++) {
      const row: SyntheticRow = { id: `row_${String(rows.length + 1)}` };
      for (let d = 0; d < 5; d++) {
        row[`dim_${String(d + 1)}`] = round((center[d] ?? 0) + rngGaussian(rng, 0, 1.5), 4);
      }
      rows.push(row);
      labels.push(`cluster_${String(c + 1)}`);
    }
  }
  return { rows, labels };
}

/** uncorrelated-random (SPEC.md §13): deliberately structureless, same generator shape, different seed. */
export function generateUncorrelatedRandom(seed: number, n = 180, dims = 5): SyntheticRow[] {
  const rng = mulberry32(seed);
  const rows: SyntheticRow[] = [];
  for (let i = 0; i < n; i++) {
    const row: SyntheticRow = { id: `row_${String(i + 1)}` };
    for (let d = 0; d < dims; d++) row[`dim_${String(d + 1)}`] = round(rngRange(rng, -10, 10), 4);
    rows.push(row);
  }
  return rows;
}

/** single-column-degenerate (SPEC.md §13): every row identical on every mapped column. */
export function generateSingleColumnDegenerate(n = 40): SyntheticRow[] {
  const rows: SyntheticRow[] = [];
  for (let i = 0; i < n; i++) {
    rows.push({ id: `row_${String(i + 1)}`, dim_1: 5, dim_2: 5, dim_3: 5, category: "only" });
  }
  return rows;
}

/** one-row (SPEC.md §13): the single-row degenerate case. */
export function generateOneRow(): SyntheticRow[] {
  return [{ id: "row_1", dim_1: 3.14, dim_2: -2.71, category: "solo" }];
}

/** high-cardinality-id-only (SPEC.md §13): every column excluded by role inference (all id-like). */
export function generateHighCardinalityIdOnly(n = 40): SyntheticRow[] {
  const rows: SyntheticRow[] = [];
  for (let i = 0; i < n; i++) {
    rows.push({ uuid_a: `a-${String(i + 1)}-${String(1000 + i * 37)}`, uuid_b: `b-${String(9999 - i)}-${String(i * 91 + 7)}` });
  }
  return rows;
}

export function toCsv(rows: SyntheticRow[]): string {
  if (rows.length === 0) return "";
  const firstRow = rows[0];
  const headers = firstRow ? Object.keys(firstRow) : [];
  const escape = (v: string | number): string => {
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(headers.map((h) => escape(row[h] ?? "")).join(","));
  }
  return lines.join("\n") + "\n";
}

export type { Rng };
