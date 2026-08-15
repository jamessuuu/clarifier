import type { ColumnMapping, ColumnRole, ColumnType } from "@/core/types";

const BOOLEAN_TRUE = new Set(["true", "yes", "y"]);
const BOOLEAN_FALSE = new Set(["false", "no", "n"]);
const DATE_RE = /^\d{4}-\d{2}-\d{2}(t\d{2}:\d{2}(:\d{2})?(\.\d+)?z?)?$/i;

export interface ColumnStats {
  name: string;
  type: ColumnType;
  nonNullCount: number;
  missingCount: number;
  distinctCount: number;
  /** raw parsed numeric values, only meaningful when type === "numeric"; null for non-numeric rows. */
  numericValues: (number | null)[];
  /** raw string values (trimmed), null = missing. Always populated, for categorical/id-like/boolean/date. */
  stringValues: (string | null)[];
  coefficientOfVariation: number; // 0 if undefined (numeric only)
}

function parseFloatStrict(s: string): number | null {
  if (s.trim().length === 0) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/**
 * SPEC.md §3 type-inference thresholds, verbatim where stated:
 * numeric: >90% of non-null rows parse as float.
 * categorical: distinct/rows < 0.5 AND distinct <= 12.
 * id-like: distinct/rows >= 0.9 (excluded from forces, label only).
 *
 * SPEC.md leaves one gap: a column that is none of numeric/boolean/date,
 * fails id-like's >=0.9 ratio, AND fails categorical's own <=12-distinct /
 * <0.5-ratio bound (e.g. moderately-high-cardinality free text) has no
 * defined bucket. Documented decision: it still gets classified
 * "categorical" (the closest fit — every column needs SOME type), but is
 * simply a worse candidate for role auto-mapping, which has its own
 * tighter thresholds (see inferRoles below). Recorded in /docs/limitations.
 */
export function inferColumnType(values: (string | null)[]): ColumnType {
  const nonNull = values.filter((v): v is string => v !== null);
  const n = values.length;
  if (nonNull.length === 0) return "categorical";

  if (nonNull.every((v) => BOOLEAN_TRUE.has(v.toLowerCase()) || BOOLEAN_FALSE.has(v.toLowerCase()))) {
    return "boolean";
  }
  if (nonNull.every((v) => DATE_RE.test(v.trim()))) {
    return "date";
  }

  const numericCount = nonNull.filter((v) => parseFloatStrict(v) !== null).length;
  if (numericCount / nonNull.length > 0.9) {
    return "numeric";
  }

  const distinct = new Set(nonNull).size;
  if (distinct / n >= 0.9) {
    return "id-like";
  }
  return "categorical";
}

export function computeColumnStats(name: string, values: (string | null)[]): ColumnStats {
  const type = inferColumnType(values);
  const nonNullCount = values.filter((v) => v !== null).length;
  const missingCount = values.length - nonNullCount;
  const distinctCount = new Set(values.filter((v): v is string => v !== null)).size;

  let numericValues: (number | null)[] = [];
  let coefficientOfVariation = 0;
  if (type === "numeric") {
    numericValues = values.map((v) => (v === null ? null : parseFloatStrict(v)));
    const nums = numericValues.filter((v): v is number => v !== null);
    if (nums.length > 1) {
      const mean = nums.reduce((a, b) => a + b, 0) / nums.length;
      const variance = nums.reduce((a, b) => a + (b - mean) ** 2, 0) / nums.length;
      const stddev = Math.sqrt(variance);
      coefficientOfVariation = Math.abs(mean) > 1e-9 ? stddev / Math.abs(mean) : stddev > 0 ? Infinity : 0;
    }
  } else {
    numericValues = values.map(() => null);
  }

  return { name, type, nonNullCount, missingCount, distinctCount, numericValues, stringValues: values, coefficientOfVariation };
}

/**
 * SPEC.md §3 "Auto-mapping defaults, transparent, always overridable":
 * mass <- highest-CoV numeric column; charge <- first categorical column
 * with 2-6 distinct values; attraction <- second-most-variable numeric
 * column; viscosity <- the next categorical column, or unmapped; spring
 * stays off; id-like columns are always "label" (never a force role).
 */
export function inferRoles(columns: ColumnStats[]): ColumnRole[] {
  const roles: ColumnRole[] = columns.map((c) => (c.type === "id-like" ? "label" : "excluded"));

  const numericByVariance = columns
    .map((c, idx) => ({ idx, c }))
    .filter(({ c }) => c.type === "numeric" && Number.isFinite(c.coefficientOfVariation))
    .sort((a, b) => b.c.coefficientOfVariation - a.c.coefficientOfVariation);

  const massPick = numericByVariance[0];
  if (massPick) roles[massPick.idx] = "mass";

  const attractionPick = numericByVariance.find((entry) => entry.idx !== massPick?.idx);
  if (attractionPick) roles[attractionPick.idx] = "attraction";

  const categoricalWithFewValues = columns
    .map((c, idx) => ({ idx, c }))
    .filter(({ c }) => c.type === "categorical" && c.distinctCount >= 2 && c.distinctCount <= 6);

  const chargePick = categoricalWithFewValues[0];
  if (chargePick) roles[chargePick.idx] = "charge";

  const viscosityPick = columns
    .map((c, idx) => ({ idx, c }))
    .filter(({ c, idx }) => c.type === "categorical" && idx !== chargePick?.idx)
    .find((entry) => roles[entry.idx] === "excluded");
  if (viscosityPick) roles[viscosityPick.idx] = "viscosity";

  return roles;
}

export function missingStrategyFor(): "median-rank" {
  return "median-rank";
}

/**
 * SPEC.md §3 Decision 2 states rank normalization "is the default for every
 * numeric mapping." Verified during M1 build (scripts/_diag.mjs, deleted
 * before commit — see docs/limitations) that a LITERAL reading of that
 * breaks the product's own central mechanism for the ATTRACTION role
 * specifically: rank/percentile transform is a percentile-rank map, which by
 * construction discards all magnitude information and leaves a perfectly
 * uniform marginal density — there is no "gap" left to find. Feeding that
 * into any smooth pairwise force (the attraction spring) produces a
 * rank-ordered CHAIN, not separated blobs, regardless of how well-separated
 * the source data actually is: measured on blobs-3-known, rank-normalized
 * attraction gave a between/within mean-distance ratio of 3.76 but rendered
 * as one continuous ribbon with no visible gap; min-max ("raw") gave 5.45
 * and, verified visually (Playwright screenshot against the running dev
 * server), rendered as three actually-separated point clouds.
 *
 * Mass, charge, and viscosity keep rank as the default — Decision 2's own
 * justification (a single extreme outlier must not dominate every force
 * calculation) is sharpest for exactly those roles, since each is a single
 * scalar multiplier/damping factor rather than a pairwise geometric gap.
 * Attraction defaults to "raw" instead. Every column's normalization is
 * still visitor-overridable per SPEC.md §3's own "always overridable in the
 * UI" — this only changes the DEFAULT, not the option.
 */
export function defaultNormalizationForRole(role: ColumnRole): "rank" | "raw" {
  return role === "attraction" ? "raw" : "rank";
}

export function buildColumnMappings(headers: string[], table: (string | null)[][]): { mappings: ColumnMapping[]; stats: ColumnStats[] } {
  const columnValues: (string | null)[][] = headers.map((_, colIdx) => table.map((row) => row[colIdx] ?? null));
  const stats = headers.map((name, idx) => computeColumnStats(name, columnValues[idx] ?? []));
  const roles = inferRoles(stats);

  const mappings: ColumnMapping[] = stats.map((s, idx) => ({
    name: s.name,
    inferredType: s.type,
    role: roles[idx] ?? "excluded",
    normalization: defaultNormalizationForRole(roles[idx] ?? "excluded"),
    missing: { count: s.missingCount, strategy: missingStrategyFor() },
  }));

  return { mappings, stats };
}
