import { describe, expect, it } from "vitest";

import { generateBlobs3Known, generateHighCardinalityIdOnly, generateOneRow, generateSingleColumnDegenerate, generateUncorrelatedRandom, toCsv } from "./synthetic";

describe("synthetic generators — SPEC.md §13 golden fixtures", () => {
  it("generateBlobs3Known is deterministic for a fixed seed", () => {
    const a = generateBlobs3Known(1);
    const b = generateBlobs3Known(1);
    expect(a).toEqual(b);
  });

  it("generateBlobs3Known produces 3 equal-sized labeled groups, labels kept separate from the mappable rows", () => {
    const { rows, labels } = generateBlobs3Known(1, 20);
    expect(rows).toHaveLength(60);
    expect(labels).toHaveLength(60);
    expect(new Set(labels).size).toBe(3);
    for (const row of rows) {
      expect(Object.keys(row)).not.toContain("true_cluster");
    }
  });

  it("generateUncorrelatedRandom is deterministic and structureless (no label column)", () => {
    const a = generateUncorrelatedRandom(2);
    const b = generateUncorrelatedRandom(2);
    expect(a).toEqual(b);
    expect(a.length).toBeGreaterThan(0);
  });

  it("generateSingleColumnDegenerate: every row identical on every mapped column", () => {
    const rows = generateSingleColumnDegenerate(10);
    const first = rows[0];
    for (const row of rows) {
      expect(row.dim_1).toBe(first?.dim_1);
      expect(row.dim_2).toBe(first?.dim_2);
      expect(row.category).toBe(first?.category);
    }
  });

  it("generateOneRow produces exactly one row", () => {
    expect(generateOneRow()).toHaveLength(1);
  });

  it("generateHighCardinalityIdOnly produces columns that are all effectively unique", () => {
    const rows = generateHighCardinalityIdOnly(20);
    const colA = new Set(rows.map((r) => r.uuid_a));
    const colB = new Set(rows.map((r) => r.uuid_b));
    expect(colA.size).toBe(20);
    expect(colB.size).toBe(20);
  });
});

describe("toCsv", () => {
  it("round-trips through the same headers every row uses", () => {
    const csv = toCsv([
      { a: 1, b: "x" },
      { a: 2, b: "y" },
    ]);
    const lines = csv.trim().split("\n");
    expect(lines[0]).toBe("a,b");
    expect(lines).toHaveLength(3);
  });

  it("quotes fields containing commas", () => {
    const csv = toCsv([{ note: "a,b" }]);
    expect(csv).toContain('"a,b"');
  });

  it("returns an empty string for zero rows", () => {
    expect(toCsv([])).toBe("");
  });
});
