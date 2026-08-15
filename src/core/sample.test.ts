import { describe, expect, it } from "vitest";

import { stratifiedSampleIndices } from "./sample";

describe("stratifiedSampleIndices", () => {
  it("returns every index when n <= budget", () => {
    const result = stratifiedSampleIndices(10, 20, null, 1);
    expect(result).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it("returns exactly `budget` indices when n > budget and no category function is given", () => {
    const result = stratifiedSampleIndices(1000, 100, null, 1);
    expect(result.length).toBe(100);
    expect(new Set(result).size).toBe(100); // no duplicates
  });

  it("is deterministic for a fixed seed", () => {
    const a = stratifiedSampleIndices(500, 50, null, 7);
    const b = stratifiedSampleIndices(500, 50, null, 7);
    expect(a).toEqual(b);
  });

  it("preserves category proportions when a categoryOf function is given", () => {
    const n = 300;
    // 3 categories, 100 each.
    const categoryOf = (i: number): number => Math.floor(i / 100);
    const result = stratifiedSampleIndices(n, 30, categoryOf, 3);
    const counts = [0, 0, 0];
    for (const i of result) counts[categoryOf(i)] = (counts[categoryOf(i)] ?? 0) + 1;
    for (const c of counts) {
      expect(c).toBeGreaterThan(0); // every category represented
      expect(c).toBeLessThanOrEqual(15); // roughly proportional (10 +/- slack), never all from one group
    }
  });

  it("returns sorted, in-range indices", () => {
    const result = stratifiedSampleIndices(200, 40, null, 9);
    for (let i = 1; i < result.length; i++) {
      expect(result[i]).toBeGreaterThan(result[i - 1] ?? -1);
    }
    for (const i of result) {
      expect(i).toBeGreaterThanOrEqual(0);
      expect(i).toBeLessThan(200);
    }
  });
});
