import { describe, expect, it } from "vitest";

import { generateHighCardinalityIdOnly, generateOneRow, toCsv } from "@/core/synthetic";

import { loadDataset } from "./useSimulation";

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

  it("a normal multi-column numeric dataset reaches 'ready' with a live Simulation instance", () => {
    const rows = Array.from({ length: 30 }, (_, i) => ({ id: `r${String(i)}`, a: i, b: 30 - i }));
    const csv = toCsv(rows);
    const outcome = loadDataset(csv, 1);
    expect(outcome.status).toBe("ready");
    if (outcome.status === "ready") {
      expect(outcome.rowCount).toBe(30);
      expect(outcome.sim.field.n).toBe(30);
    }
  });
});
