import { describe, expect, it } from "vitest";

import { kmeans } from "./kmeans";
import { mulberry32 } from "./rng";

describe("kmeans", () => {
  it("finds two well-separated clusters correctly", () => {
    const rng = mulberry32(3);
    const points: number[][] = [];
    for (let i = 0; i < 20; i++) points.push([rng() * 0.1, rng() * 0.1]); // tight cluster near (0,0)
    for (let i = 0; i < 20; i++) points.push([100 + rng() * 0.1, 100 + rng() * 0.1]);
    const result = kmeans(points, 2, 42);
    const firstGroup = result.assignments.slice(0, 20);
    const secondGroup = result.assignments.slice(20);
    // All of the first 20 share one label, all of the second 20 share the other.
    expect(new Set(firstGroup).size).toBe(1);
    expect(new Set(secondGroup).size).toBe(1);
    expect(firstGroup[0]).not.toBe(secondGroup[0]);
  });

  it("is deterministic for a fixed seed", () => {
    const points = Array.from({ length: 40 }, (_, i) => [i % 7, (i * 3) % 11]);
    const a = kmeans(points, 3, 5);
    const b = kmeans(points, 3, 5);
    expect(a.assignments).toEqual(b.assignments);
  });

  it("clamps k to at most n", () => {
    const points = [[0, 0], [1, 1]];
    const result = kmeans(points, 10, 1);
    expect(result.k).toBeLessThanOrEqual(2);
  });

  it("handles n=0 without throwing", () => {
    const result = kmeans([], 3, 1);
    expect(result.assignments).toEqual([]);
  });

  it("every point gets assigned to some cluster in [0, k)", () => {
    const points = Array.from({ length: 30 }, (_, i) => [Math.sin(i), Math.cos(i * 2)]);
    const result = kmeans(points, 4, 7);
    for (const a of result.assignments) {
      expect(a).toBeGreaterThanOrEqual(0);
      expect(a).toBeLessThan(result.k);
    }
  });
});
