"use client";

import { useMemo } from "react";

import { hashRow } from "@/core/hash";
import { Simulation } from "@/core/simulation";
import { DEFAULT_FORCES, type ColumnMapping } from "@/core/types";
import { buildColumnMappings, type ColumnStats } from "@/csv/infer";
import { parseCsv } from "@/csv/parse";
import { resolveForceField } from "@/csv/resolve-forces";

export type DatasetOutcome =
  | { status: "empty" }
  | { status: "parse-error"; reason: string; message: string }
  | { status: "zero-usable-columns"; seenColumns: { name: string; type: string; reason: string }[] }
  | {
      status: "ready";
      headers: string[];
      rowCount: number;
      mappings: ColumnMapping[];
      stats: ColumnStats[];
      sim: Simulation;
    };

/**
 * SPEC.md §12 failure contracts, resolved in one place so every consumer
 * (the tool page, e2e tests, the results panel) sees the same classification
 * instead of re-deriving it. Pure w.r.t. React (no DOM reads) — the only
 * "impurity" is constructing a Simulation, which itself is DOM-free
 * (core/simulation.ts).
 */
export function loadDataset(csvText: string, seed: number): DatasetOutcome {
  const parsed = parseCsv(csvText);
  if (!parsed.ok) {
    if (parsed.reason === "empty") return { status: "empty" };
    return { status: "parse-error", reason: parsed.reason, message: parsed.message };
  }

  const { mappings, stats } = buildColumnMappings(parsed.headers, parsed.rows);
  const usableRoles = new Set(["mass", "charge", "attraction", "viscosity", "spring-anchor"]);
  const hasUsableColumn = mappings.some((m) => usableRoles.has(m.role));
  if (!hasUsableColumn) {
    return {
      status: "zero-usable-columns",
      seenColumns: mappings.map((m) => ({
        name: m.name,
        type: m.inferredType,
        reason: m.inferredType === "id-like" ? "high-cardinality / id-like — offered only as a row label" : `inferred ${m.inferredType}, not a usable force role`,
      })),
    };
  }

  const { field } = resolveForceField(mappings, stats, parsed.rows.length);
  const rowSeeds = new Uint32Array(parsed.rows.map((row) => hashRow(row)));
  const sim = new Simulation({ seed, dt: 1 / 60, forces: DEFAULT_FORCES, rowSeeds }, field);

  return { status: "ready", headers: parsed.headers, rowCount: parsed.rows.length, mappings, stats, sim };
}

export function useDataset(csvText: string, seed: number): DatasetOutcome {
  // Re-parsing on every keystroke would be wasteful for a large paste; the
  // caller debounces the text before it reaches this hook (SimulationHost).
  return useMemo(() => loadDataset(csvText, seed), [csvText, seed]);
}
