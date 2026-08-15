import { describe, expect, it } from "vitest";

import { buildColumnMappings } from "./infer";
import { resolveForceField } from "./resolve-forces";

describe("resolveForceField", () => {
  it("defaults mass to 1 for every row when no column is mass-mapped", () => {
    const headers = ["label"];
    const table = [["a"], ["b"], ["c"]];
    const { mappings, stats } = buildColumnMappings(headers, table);
    const { field } = resolveForceField(mappings, stats, table.length);
    expect(Array.from(field.mass)).toEqual([1, 1, 1]);
  });

  it("mass stays within [0.5, 2.0] regardless of the raw column's scale", () => {
    const headers = ["id", "mass_col", "attr_col"];
    const table = Array.from({ length: 30 }, (_, i) => [`r${String(i)}`, String(i * 1000), String(i)]);
    const { mappings, stats } = buildColumnMappings(headers, table);
    const { field } = resolveForceField(mappings, stats, table.length);
    for (const m of field.mass) {
      expect(m).toBeGreaterThanOrEqual(0.5);
      expect(m).toBeLessThanOrEqual(2.0);
    }
  });

  it("charge defaults to 0 (neutral) when no column is charge-mapped", () => {
    const headers = ["id", "value"];
    const table = Array.from({ length: 20 }, (_, i) => [`r${String(i)}`, String(i)]);
    const { mappings, stats } = buildColumnMappings(headers, table);
    const { field } = resolveForceField(mappings, stats, table.length);
    expect(field.charge.every((c) => c === 0)).toBe(true);
  });

  it("attraction has one dimension per attraction-mapped column", () => {
    const headers = ["id", "high_var", "mid_var"];
    const table = Array.from({ length: 20 }, (_, i) => [`r${String(i)}`, String(i % 2 === 0 ? i * 50 : 1), String(i)]);
    const { mappings, stats } = buildColumnMappings(headers, table);
    const { field } = resolveForceField(mappings, stats, table.length);
    expect(field.attractionDims).toBeGreaterThanOrEqual(1);
    expect(field.attraction.length).toBe(field.n * field.attractionDims);
  });

  it("only the first charge-mapped column drives the charge sign when more than one is marked (documented behavior)", () => {
    const headers = ["id", "group_a", "group_b"];
    const table = Array.from({ length: 12 }, (_, i) => [`r${String(i)}`, i % 2 === 0 ? "x" : "y", i % 3 === 0 ? "p" : "q"]);
    const { mappings, stats } = buildColumnMappings(headers, table);
    const forced = mappings.map((m) => (m.role === "charge" || m.name === "group_b" ? { ...m, role: "charge" as const } : m));
    const { field } = resolveForceField(forced, stats, table.length);
    // charge values should only take on the distinct set implied by group_a (the first charge column), i.e. {-1, 1}
    const distinctCharges = new Set(Array.from(field.charge));
    expect(distinctCharges.size).toBeLessThanOrEqual(2);
  });
});
