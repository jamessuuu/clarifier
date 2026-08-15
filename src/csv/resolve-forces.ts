import type { ForceField } from "@/core/physics";
import type { ColumnMapping } from "@/core/types";

import type { ColumnStats } from "./infer";
import { encodeCategorical, normalizeNumericColumn } from "./normalize";

const MASS_MIN = 0.5;
const MASS_MAX = 2.0;

export interface ResolvedForceField {
  field: ForceField;
  /** Category label lists for columns used as charge or viscosity, keyed by column name — needed later by the results panel (SPEC.md §11) and the mapping UI. */
  categoriesByColumn: Record<string, string[]>;
}

function chargeValuesForColumn(mapping: ColumnMapping, stat: ColumnStats): { values: Float32Array; categories: string[] } {
  if (stat.type === "numeric") {
    const rank = normalizeNumericColumn(stat.numericValues, mapping.normalization);
    const values = new Float32Array(rank.length);
    for (let i = 0; i < rank.length; i++) values[i] = 2 * (rank[i] ?? 0.5) - 1;
    return { values, categories: [] };
  }
  const enc = encodeCategorical(stat.stringValues);
  return { values: enc.charge, categories: enc.categories };
}

function viscosityValuesForColumn(mapping: ColumnMapping, stat: ColumnStats): { values: Float32Array; categories: string[] } {
  if (stat.type === "numeric") {
    return { values: normalizeNumericColumn(stat.numericValues, mapping.normalization), categories: [] };
  }
  const enc = encodeCategorical(stat.stringValues);
  return { values: enc.values01, categories: enc.categories };
}

/**
 * SPEC.md §3/§4: turns visitor-facing ColumnMapping[] (+ the raw column
 * stats parsed by csv/infer.ts) into the flattened, typed-array ForceField
 * core/physics.ts consumes. Lives in csv/, not core/, so core/ never has to
 * know ColumnMapping/CSV exist — it only ever sees ForceField.
 */
export function resolveForceField(mappings: ColumnMapping[], stats: ColumnStats[], rowCount: number): ResolvedForceField {
  const categoriesByColumn: Record<string, string[]> = {};

  // --- mass: average every mass-mapped column's normalized value, remapped to [MASS_MIN, MASS_MAX] ---
  const massCols = mappings.map((m, idx) => ({ m, idx })).filter(({ m }) => m.role === "mass");
  const mass = new Float32Array(rowCount).fill(1);
  if (massCols.length > 0) {
    const sums = new Float32Array(rowCount);
    for (const { m, idx } of massCols) {
      const stat = stats[idx];
      if (!stat) continue;
      const norm = normalizeNumericColumn(stat.numericValues, m.normalization);
      for (let i = 0; i < rowCount; i++) sums[i] = (sums[i] ?? 0) + (norm[i] ?? 0.5);
    }
    for (let i = 0; i < rowCount; i++) {
      const avg = (sums[i] ?? 0) / massCols.length;
      mass[i] = MASS_MIN + avg * (MASS_MAX - MASS_MIN);
    }
  }

  // --- attraction: one dimension per attraction-mapped column, kept separate (Euclidean distance across dims in physics.ts) ---
  const attractionCols = mappings.map((m, idx) => ({ m, idx })).filter(({ m }) => m.role === "attraction");
  const attractionDims = attractionCols.length;
  const attraction = new Float32Array(rowCount * attractionDims);
  attractionCols.forEach(({ m, idx }, dim) => {
    const stat = stats[idx];
    if (!stat) return;
    const norm = normalizeNumericColumn(stat.numericValues, m.normalization);
    for (let i = 0; i < rowCount; i++) attraction[i * attractionDims + dim] = norm[i] ?? 0.5;
  });

  // --- charge: SPEC.md auto-maps at most one column, but an override could mark more than one; only the FIRST charge-mapped column drives group sign (documented — combining charge semantics across multiple columns is undefined by SPEC.md) ---
  const chargeCol = mappings.map((m, idx) => ({ m, idx })).find(({ m }) => m.role === "charge");
  const charge = new Float32Array(rowCount);
  if (chargeCol) {
    const stat = stats[chargeCol.idx];
    if (stat) {
      const { values, categories } = chargeValuesForColumn(chargeCol.m, stat);
      charge.set(values);
      if (categories.length > 0) categoriesByColumn[chargeCol.m.name] = categories;
    }
  }

  // --- viscosity: average every viscosity-mapped column's [0,1] value ---
  const viscosityCols = mappings.map((m, idx) => ({ m, idx })).filter(({ m }) => m.role === "viscosity");
  const viscosity = new Float32Array(rowCount);
  if (viscosityCols.length > 0) {
    const sums = new Float32Array(rowCount);
    for (const { m, idx } of viscosityCols) {
      const stat = stats[idx];
      if (!stat) continue;
      const { values, categories } = viscosityValuesForColumn(m, stat);
      for (let i = 0; i < rowCount; i++) sums[i] = (sums[i] ?? 0) + (values[i] ?? 0.5);
      if (categories.length > 0) categoriesByColumn[m.name] = categories;
    }
    for (let i = 0; i < rowCount; i++) viscosity[i] = (sums[i] ?? 0) / viscosityCols.length;
  }

  return {
    field: { n: rowCount, mass, charge, viscosity, attraction, attractionDims },
    categoriesByColumn,
  };
}
