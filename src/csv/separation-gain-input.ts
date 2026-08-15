import type { NamedNumericColumn } from "@/core/results-analysis";
import type { SeparationGainInput } from "@/core/separation-gain";
import type { ColumnMapping } from "@/core/types";

import type { ColumnStats } from "./infer";
import { encodeCategorical, normalizeNumericColumn } from "./normalize";

const NUMERIC_FORCE_ROLES = new Set<ColumnMapping["role"]>(["mass", "charge", "attraction", "viscosity"]);

/**
 * SPEC.md §2: "the top-2 PCA components of the mapped numeric columns" —
 * every numeric column carrying an active force role (not just attraction),
 * each using its own configured normalization. Also resolves `k`'s source
 * (the visitor's categorical charge mapping, if one exists) and a
 * `categoryOf` function for stratified sampling above the metric's own
 * sample cap (SEPARATION_GAIN_SAMPLE_CAP).
 */
export function buildSeparationGainInput(mappings: readonly ColumnMapping[], stats: readonly ColumnStats[], n: number, physicsPositions: Float32Array, seed: number): SeparationGainInput {
  const pcaColumns: Float32Array[] = [];
  mappings.forEach((m, idx) => {
    const stat = stats[idx];
    if (!stat) return;
    if (NUMERIC_FORCE_ROLES.has(m.role) && stat.type === "numeric") {
      pcaColumns.push(normalizeNumericColumn(stat.numericValues, m.normalization));
    }
  });

  const chargeIdx = mappings.findIndex((m) => m.role === "charge");
  const chargeStat = chargeIdx >= 0 ? stats[chargeIdx] : undefined;
  const categoricalK = chargeStat && chargeStat.type !== "numeric" ? chargeStat.distinctCount : null;

  let categoryOf: ((i: number) => number) | null = null;
  if (chargeStat && chargeStat.type !== "numeric") {
    const { values01 } = encodeCategorical(chargeStat.stringValues);
    const distinct = Math.max(1, chargeStat.distinctCount);
    categoryOf = (i: number) => Math.round((values01[i] ?? 0) * (distinct - 1));
  }

  return { n, pcaColumns, physicsPositions, categoricalK, categoryOf, seed };
}

/** For the accessible results panel (SPEC.md §11) — the same mapped numeric columns as PCA sees, but with raw (unnormalized) values, since a value RANGE is only meaningful to a reader in the source units. */
export function buildNamedNumericColumns(mappings: readonly ColumnMapping[], stats: readonly ColumnStats[]): NamedNumericColumn[] {
  const out: NamedNumericColumn[] = [];
  mappings.forEach((m, idx) => {
    const stat = stats[idx];
    if (!stat) return;
    if (NUMERIC_FORCE_ROLES.has(m.role) && stat.type === "numeric") {
      out.push({ name: m.name, rawValues: stat.numericValues });
    }
  });
  return out;
}
