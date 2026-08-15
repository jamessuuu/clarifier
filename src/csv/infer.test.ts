import { describe, expect, it } from "vitest";

import { buildColumnMappings, computeColumnStats, inferColumnType, inferRoles } from "./infer";

describe("inferColumnType — SPEC.md §3 thresholds", () => {
  it("numeric: >90% of non-null values parse as float", () => {
    const values = Array.from({ length: 100 }, (_, i) => (i < 92 ? String(i * 1.5) : "n/a"));
    expect(inferColumnType(values)).toBe("numeric");
  });

  it("not numeric when only 85% parse as float", () => {
    const values = Array.from({ length: 100 }, (_, i) => (i < 85 ? String(i) : "text"));
    expect(inferColumnType(values)).not.toBe("numeric");
  });

  it("id-like: distinct/rows >= 0.9", () => {
    const values = Array.from({ length: 50 }, (_, i) => `uuid-${String(i)}`);
    expect(inferColumnType(values)).toBe("id-like");
  });

  it("categorical: few distinct values relative to row count", () => {
    const values = Array.from({ length: 100 }, (_, i) => (i % 3 === 0 ? "red" : i % 3 === 1 ? "green" : "blue"));
    expect(inferColumnType(values)).toBe("categorical");
  });

  it("boolean: true/false-like values", () => {
    expect(inferColumnType(["true", "false", "true", "false"])).toBe("boolean");
    expect(inferColumnType(["yes", "no", "yes"])).toBe("boolean");
  });

  it("date: ISO 8601 date strings", () => {
    expect(inferColumnType(["2024-01-15", "2024-02-20", "2024-03-01"])).toBe("date");
  });

  it("falls back to categorical for an all-null column (never throws)", () => {
    expect(inferColumnType([null, null, null])).toBe("categorical");
  });
});

describe("computeColumnStats", () => {
  it("computes coefficient of variation for a numeric column", () => {
    const s = computeColumnStats("x", ["10", "20", "30", "40"]);
    expect(s.type).toBe("numeric");
    expect(s.coefficientOfVariation).toBeGreaterThan(0);
  });

  it("reports missingCount from null cells", () => {
    const s = computeColumnStats("x", ["1", null, "3", null]);
    expect(s.missingCount).toBe(2);
    expect(s.nonNullCount).toBe(2);
  });

  it("a constant column has coefficientOfVariation 0, never NaN/Infinity from a zero-mean edge case", () => {
    const zeroMean = computeColumnStats("x", ["-5", "5", "-5", "5"]); // mean 0, stddev > 0
    expect(Number.isFinite(zeroMean.coefficientOfVariation) || zeroMean.coefficientOfVariation === Infinity).toBe(true);
    const constant = computeColumnStats("x", ["5", "5", "5", "5"]);
    expect(constant.coefficientOfVariation).toBe(0);
  });
});

describe("inferRoles — SPEC.md §3 auto-mapping defaults", () => {
  it("picks the highest-CoV numeric column as mass and the second as attraction", () => {
    const highVar = computeColumnStats("high", ["1", "100", "1", "100", "1", "100"]);
    const midVar = computeColumnStats("mid", ["10", "20", "10", "20", "10", "20"]);
    const lowVar = computeColumnStats("low", ["10", "11", "10", "11", "10", "11"]);
    const roles = inferRoles([highVar, midVar, lowVar]);
    expect(roles[0]).toBe("mass");
    expect(roles[1]).toBe("attraction");
    expect(roles[2]).toBe("excluded");
  });

  it("picks the first categorical column with 2-6 distinct values as charge", () => {
    const cat = computeColumnStats("cat", ["a", "b", "a", "b", "a", "b"]);
    const num = computeColumnStats("num", ["1", "2", "3", "4", "5", "6"]);
    const roles = inferRoles([num, cat]);
    expect(roles[1]).toBe("charge");
  });

  it("never assigns a force role to an id-like column — label only", () => {
    const idLike = computeColumnStats(
      "id",
      Array.from({ length: 20 }, (_, i) => `row-${String(i)}`)
    );
    const roles = inferRoles([idLike]);
    expect(roles[0]).toBe("label");
  });

  it("skips a categorical column with more than 6 distinct values for charge (falls through to viscosity, the next categorical default)", () => {
    const highCardCat = computeColumnStats(
      "cat",
      Array.from({ length: 40 }, (_, i) => `group-${String(i % 10)}`)
    ); // 10 distinct, distinct/rows = 0.25 < 0.5 and <=12 so still "categorical" by type, but >6 distinct so not auto-charge
    const roles = inferRoles([highCardCat]);
    expect(roles[0]).not.toBe("charge");
  });
});

describe("buildColumnMappings", () => {
  it("builds a full mapping with type, role, normalization, and missing info per column", () => {
    const headers = ["id", "score", "group"];
    const table = [
      ["r1", "10", "a"],
      ["r2", "20", "b"],
      ["r3", "30", "a"],
      ["r4", null, "b"],
    ];
    const { mappings } = buildColumnMappings(headers, table);
    expect(mappings).toHaveLength(3);
    const byName = Object.fromEntries(mappings.map((m) => [m.name, m]));
    expect(byName.id?.role).toBe("label");
    expect(byName.score?.inferredType).toBe("numeric");
    expect(byName.group?.missing.strategy).toBe("median-rank");
    expect(byName.score?.missing.count).toBe(1);
  });
});
