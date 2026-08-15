// SPEC.md §3 — the typed, serializable, seedable data model. This is what
// lets the CPU/JS reference core, the WGSL compute path, and the CI golden
// fixtures all agree on "what physics actually ran."

export type ColumnType = "numeric" | "categorical" | "boolean" | "id-like" | "date";

export type ColumnRole = "mass" | "charge" | "attraction" | "viscosity" | "spring-anchor" | "label" | "excluded";

export interface ColumnMapping {
  name: string;
  inferredType: ColumnType;
  role: ColumnRole;
  normalization: "rank" | "raw";
  missing: { count: number; strategy: "median-rank" };
}

export interface ForceConfig {
  centering: number;
  attraction: number;
  charge: number;
  viscosityBase: number;
  spring: number;
  collision: number;
}

/** Optional explicit pairwise relation (spring), only active when the visitor wires a from/to pair (SPEC.md §3). */
export interface SpringEdge {
  from: number; // row index
  to: number; // row index
}

export interface SimConfig {
  seed: number;
  dt: number;
  columns: ColumnMapping[];
  forces: ForceConfig;
  pointBudget: number;
  springEdges?: SpringEdge[];
}

export type SeparationVerdict = "stronger" | "no-meaningful-gain" | "insufficient-variance";

export interface SeparationGain {
  pca2dSilhouette: number;
  physicsSilhouette: number;
  k: number;
  verdict: SeparationVerdict;
}

export type Rung = "webgpu" | "webgl2" | "static";

export interface SimState {
  rung: Rung;
  positions: Float32Array; // n * 2
  velocities: Float32Array; // n * 2
  step: number;
  temperature: number;
  keHistory: number[];
  converged: boolean;
  separationGain: SeparationGain | null;
}

/** Per-row derived force inputs, resolved once from ColumnMapping + raw values (SPEC.md §4). */
export interface RowForceProfile {
  mass: number; // rank-normalized [0,1], remapped to a usable physical range
  charge: number; // signed value in [-1, 1], or 0 if no charge mapping
  attraction: Float32Array; // rank-normalized values of every attraction-mapped column, [0,1] each
  viscosity: number; // [0,1]
}

export const DEFAULT_FORCES: ForceConfig = {
  centering: 0.02,
  attraction: 1.4,
  charge: 0.9,
  viscosityBase: 0.06,
  spring: 0.0,
  collision: 2.2,
};
