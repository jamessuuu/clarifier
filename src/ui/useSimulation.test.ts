import { describe, expect, it } from "vitest";

import { generateHighCardinalityIdOnly, generateOneRow, toCsv } from "@/core/synthetic";

import { buildSimulation, loadDataset, parseAndInfer } from "./useSimulation";

describe("loadDataset — SPEC.md §12 failure contracts, resolved in one place", () => {
  it("classifies empty input", () => {
    const outcome = loadDataset("", 1);
    expect(outcome.status).toBe("empty");
  });

  it("classifies JSON as a parse error naming what was detected", () => {
    const outcome = loadDataset('{"a": 1}', 1);
    expect(outcome.status).toBe("parse-error");
    if (outcome.status === "parse-error") expect(outcome.reason).toBe("json");
  });

  it("classifies an all-id-like dataset as zero-usable-columns, never a silent blank canvas", () => {
    const csv = toCsv(generateHighCardinalityIdOnly(20));
    const outcome = loadDataset(csv, 1);
    expect(outcome.status).toBe("zero-usable-columns");
    if (outcome.status === "zero-usable-columns") {
      expect(outcome.seenColumns.length).toBeGreaterThan(0);
    }
  });

  it("a one-row dataset still reaches 'ready' (separation-gain handles insufficient-variance separately, not this layer)", () => {
    const csv = toCsv(generateOneRow());
    const outcome = loadDataset(csv, 1);
    expect(outcome.status).toBe("ready");
  });

  it("a normal multi-column numeric dataset reaches 'ready' with a live, CONVERGED Simulation and a separationGain", () => {
    const rows = Array.from({ length: 30 }, (_, i) => ({ id: `r${String(i)}`, a: i, b: 30 - i }));
    const csv = toCsv(rows);
    const outcome = loadDataset(csv, 1);
    expect(outcome.status).toBe("ready");
    if (outcome.status === "ready") {
      expect(outcome.rowCount).toBe(30);
      expect(outcome.sim.field.n).toBe(30);
      expect(outcome.sim.converged).toBe(true);
      expect(["stronger", "no-meaningful-gain", "insufficient-variance"]).toContain(outcome.separationGain.verdict);
    }
  });
});

describe("parseAndInfer + buildSimulation — the two-phase split the mapping panel relies on", () => {
  it("buildSimulation returns a FRESH, UNCONVERGED simulation — the caller animates it, this never auto-solves", () => {
    const rows = Array.from({ length: 30 }, (_, i) => ({ id: `r${String(i)}`, a: i, b: 30 - i }));
    const csv = toCsv(rows);
    const outcome = parseAndInfer(csv);
    expect(outcome.status).toBe("ready");
    if (outcome.status !== "ready") return;
    const sim = buildSimulation(outcome.parsed, outcome.mappings, outcome.stats, 1);
    expect(sim.step).toBe(0);
    expect(sim.converged).toBe(false);
  });

  it("re-running buildSimulation with an overridden mapping changes the resolved force field", () => {
    const rows = Array.from({ length: 20 }, (_, i) => ({ id: `r${String(i)}`, a: i, group: i % 2 === 0 ? "x" : "y" }));
    const csv = toCsv(rows);
    const outcome = parseAndInfer(csv);
    expect(outcome.status).toBe("ready");
    if (outcome.status !== "ready") return;
    const overridden = outcome.mappings.map((m) => (m.name === "group" ? { ...m, role: "charge" as const } : m));
    const sim = buildSimulation(outcome.parsed, overridden, outcome.stats, 1);
    // With "group" now mapped to charge, at least one row should carry a nonzero charge.
    expect(Array.from(sim.field.charge).some((c) => c !== 0)).toBe(true);
  });
});
