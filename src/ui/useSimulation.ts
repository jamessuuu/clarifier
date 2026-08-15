"use client";

import { useMemo } from "react";

import { hashRow } from "@/core/hash";
import { computeSeparationGain, type SeparationGainInput } from "@/core/separation-gain";
import { Simulation } from "@/core/simulation";
import { DEFAULT_FORCES, type ColumnMapping, type SeparationGain } from "@/core/types";
import { buildColumnMappings, type ColumnStats } from "@/csv/infer";
import { type ParsedTable, parseCsv } from "@/csv/parse";
import { resolveForceField } from "@/csv/resolve-forces";
import { buildSeparationGainInput } from "@/csv/separation-gain-input";

export type ParseOutcome =
  | { status: "empty" }
  | { status: "parse-error"; reason: string; message: string }
  | { status: "zero-usable-columns"; seenColumns: { name: string; type: string; reason: string }[]; parsed: ParsedTable; mappings: ColumnMapping[]; stats: ColumnStats[] }
  | { status: "ready"; parsed: ParsedTable; mappings: ColumnMapping[]; stats: ColumnStats[] };

const USABLE_ROLES = new Set<ColumnMapping["role"]>(["mass", "charge", "attraction", "viscosity", "spring-anchor"]);

function classify(parsed: ParsedTable, mappings: ColumnMapping[], stats: ColumnStats[]): ParseOutcome {
  const hasUsableColumn = mappings.some((m) => USABLE_ROLES.has(m.role));
  if (!hasUsableColumn) {
    return {
      status: "zero-usable-columns",
      parsed,
      mappings,
      stats,
      seenColumns: mappings.map((m) => ({
        name: m.name,
        type: m.inferredType,
        reason: m.inferredType === "id-like" ? "high-cardinality / id-like — offered only as a row label" : `inferred ${m.inferredType}, not a usable force role`,
      })),
    };
  }
  return { status: "ready", parsed, mappings, stats };
}

/**
 * Phase 1: parse + auto-infer. SPEC.md §12 failure contracts, resolved in
 * one place. Independent of any visitor mapping overrides — those are
 * applied downstream by buildSimulation, which re-derives the ForceField
 * from whatever ColumnMapping[] the mapping panel currently holds without
 * re-parsing the CSV text.
 */
export function parseAndInfer(csvText: string): ParseOutcome {
  const parsed = parseCsv(csvText);
  if (!parsed.ok) {
    if (parsed.reason === "empty") return { status: "empty" };
    return { status: "parse-error", reason: parsed.reason, message: parsed.message };
  }
  const { mappings, stats } = buildColumnMappings(parsed.headers, parsed.rows);
  return classify(parsed, mappings, stats);
}

/**
 * Phase 2: given (possibly visitor-overridden) mappings, build the
 * ForceField + a fresh, UNCONVERGED Simulation — the caller (SimulationCanvas)
 * animates it via requestAnimationFrame. Deliberately does not run to
 * convergence here: the whole point of M1's accumulator loop is watching it
 * settle, and separation-gain (which needs the FINAL settled positions) is
 * computed separately once the sim actually reaches convergence — see
 * computeSeparationGainForSim.
 */
export function buildSimulation(parsed: ParsedTable, mappings: ColumnMapping[], stats: ColumnStats[], seed: number): Simulation {
  const { field } = resolveForceField(mappings, stats, parsed.rows.length);
  const rowSeeds = new Uint32Array(parsed.rows.map((row) => hashRow(row)));
  return new Simulation({ seed, dt: 1 / 60, forces: DEFAULT_FORCES, rowSeeds }, field);
}

/** Computed once a Simulation has actually converged (SPEC.md §2: the metric compares against the FINAL settled physics positions). */
export function computeSeparationGainForSim(sim: Simulation, mappings: ColumnMapping[], stats: ColumnStats[], seed: number): SeparationGain {
  const gainInput: SeparationGainInput = buildSeparationGainInput(mappings, stats, sim.field.n, sim.positions, seed);
  return computeSeparationGain(gainInput);
}

export function useParsedDataset(csvText: string): ParseOutcome {
  return useMemo(() => parseAndInfer(csvText), [csvText]);
}

export type LoadDatasetOutcome =
  | Exclude<ParseOutcome, { status: "ready" }>
  | { status: "ready"; parsed: ParsedTable; mappings: ColumnMapping[]; stats: ColumnStats[]; sim: Simulation; separationGain: SeparationGain; headers: string[]; rowCount: number };

/**
 * Synchronous, single-shot helper: parses, auto-maps, builds, and runs to
 * convergence immediately. Used by tests/evals that want a final answer
 * without driving an animation loop — NOT used by the live UI (which needs
 * the unconverged Simulation from buildSimulation to animate).
 */
export function loadDataset(csvText: string, seed: number): LoadDatasetOutcome {
  const outcome = parseAndInfer(csvText);
  if (outcome.status !== "ready") return outcome;
  const sim = buildSimulation(outcome.parsed, outcome.mappings, outcome.stats, seed);
  sim.runToConvergence(8000);
  const separationGain = computeSeparationGainForSim(sim, outcome.mappings, outcome.stats, seed);
  return { status: "ready", parsed: outcome.parsed, mappings: outcome.mappings, stats: outcome.stats, sim, separationGain, headers: outcome.parsed.headers, rowCount: outcome.parsed.rows.length };
}
