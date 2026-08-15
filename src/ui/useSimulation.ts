"use client";

import { useMemo } from "react";

import { hashRow } from "@/core/hash";
import { stratifiedSampleIndices } from "@/core/sample";
import { computeSeparationGain, type SeparationGainInput } from "@/core/separation-gain";
import { Simulation } from "@/core/simulation";
import { DEFAULT_FORCES, type ColumnMapping, type SeparationGain } from "@/core/types";
import { buildColumnMappings, type ColumnStats } from "@/csv/infer";
import { encodeCategorical } from "@/csv/normalize";
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

export interface SampleInfo {
  shown: number;
  total: number;
  sampled: boolean;
}

/**
 * SPEC.md §5: above the resolved rung's point budget, take a STRATIFIED
 * random sample (preserving category proportions on the primary
 * charge-mapped column, if any) rather than a silent truncation. Shared
 * sampling primitive (core/sample.ts) with the separation-gain metric's own
 * cap, so "stratified sample" means the same thing everywhere it's used.
 */
function sampleForBudget(parsed: ParsedTable, mappings: ColumnMapping[], stats: ColumnStats[], budget: number, seed: number): { parsed: ParsedTable; stats: ColumnStats[]; info: SampleInfo } {
  const total = parsed.rows.length;
  if (total <= budget) {
    return { parsed, stats, info: { shown: total, total, sampled: false } };
  }

  const chargeIdx = mappings.findIndex((m) => m.role === "charge");
  const chargeStat = chargeIdx >= 0 ? stats[chargeIdx] : undefined;
  let categoryOf: ((i: number) => number) | null = null;
  if (chargeStat && chargeStat.type !== "numeric") {
    const { values01 } = encodeCategorical(chargeStat.stringValues);
    const distinct = Math.max(1, chargeStat.distinctCount);
    categoryOf = (i: number) => Math.round((values01[i] ?? 0) * (distinct - 1));
  }

  const indices = stratifiedSampleIndices(total, budget, categoryOf, seed);
  const sampledRows = indices.map((i) => parsed.rows[i] ?? []);
  const sampledParsed: ParsedTable = { ...parsed, rows: sampledRows };
  const sampledStats: ColumnStats[] = stats.map((s) => ({
    ...s,
    numericValues: indices.map((i) => s.numericValues[i] ?? null),
    stringValues: indices.map((i) => s.stringValues[i] ?? null),
  }));

  return { parsed: sampledParsed, stats: sampledStats, info: { shown: indices.length, total, sampled: true } };
}

/**
 * Phase 2: given (possibly visitor-overridden) mappings, build the
 * ForceField + a fresh, UNCONVERGED Simulation — the caller (SimulationCanvas)
 * animates it via requestAnimationFrame. Deliberately does not run to
 * convergence here: the whole point of M1's accumulator loop is watching it
 * settle, and separation-gain (which needs the FINAL settled positions) is
 * computed separately once the sim actually reaches convergence — see
 * computeSeparationGainForSim. `budget` is the active rung's point budget
 * (SPEC.md §5); rows beyond it are stratified-sampled down, never truncated
 * silently.
 */
export function buildSimulation(parsed: ParsedTable, mappings: ColumnMapping[], stats: ColumnStats[], seed: number, budget: number): { sim: Simulation; sampledStats: ColumnStats[]; sampleInfo: SampleInfo } {
  const { parsed: sampledParsed, stats: sampledStats, info } = sampleForBudget(parsed, mappings, stats, budget, seed);
  const { field } = resolveForceField(mappings, sampledStats, sampledParsed.rows.length);
  const rowSeeds = new Uint32Array(sampledParsed.rows.map((row) => hashRow(row)));
  const sim = new Simulation({ seed, dt: 1 / 60, forces: DEFAULT_FORCES, rowSeeds }, field);
  return { sim, sampledStats, sampleInfo: info };
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
 * the unconverged Simulation from buildSimulation to animate). No sampling
 * budget applied (Number.POSITIVE_INFINITY) — tests want the full dataset.
 */
export function loadDataset(csvText: string, seed: number): LoadDatasetOutcome {
  const outcome = parseAndInfer(csvText);
  if (outcome.status !== "ready") return outcome;
  const { sim, sampledStats } = buildSimulation(outcome.parsed, outcome.mappings, outcome.stats, seed, Number.POSITIVE_INFINITY);
  sim.runToConvergence(8000);
  const separationGain = computeSeparationGainForSim(sim, outcome.mappings, sampledStats, seed);
  return { status: "ready", parsed: outcome.parsed, mappings: outcome.mappings, stats: outcome.stats, sim, separationGain, headers: outcome.parsed.headers, rowCount: outcome.parsed.rows.length };
}
