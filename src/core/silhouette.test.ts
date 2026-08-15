import { describe, expect, it } from "vitest";

import { silhouetteScore } from "./silhouette";

describe("silhouetteScore", () => {
  it("scores near +1 for two tight, far-apart clusters", () => {
    const points = [
      [0, 0],
      [0.1, 0],
      [0.05, 0.05],
      [10, 10],
      [10.1, 10],
      [10.05, 10.05],
    ];
    const assignments = [0, 0, 0, 1, 1, 1];
    const { mean } = silhouetteScore(points, assignments, 2);
    expect(mean).toBeGreaterThan(0.9);
  });

  it("scores near 0 when clusters are not actually separated (assignment is arbitrary)", () => {
    // A single tight blob split into two "clusters" by an arbitrary line.
    const points = [
      [0, 0],
      [0.1, 0.1],
      [0.2, 0],
      [0.05, 0.15],
      [0.15, 0.05],
      [0.1, 0],
    ];
    const assignments = [0, 1, 0, 1, 0, 1];
    const { mean } = silhouetteScore(points, assignments, 2);
    expect(Math.abs(mean)).toBeLessThan(0.5);
  });

  it("returns 0 for k<=1 or n=0", () => {
    expect(silhouetteScore([[0, 0]], [0], 1).mean).toBe(0);
    expect(silhouetteScore([], [], 2).mean).toBe(0);
  });

  it("returns one score per point", () => {
    const points = [[0, 0], [1, 1], [2, 2], [10, 10]];
    const { perPoint } = silhouetteScore(points, [0, 0, 0, 1], 2);
    expect(perPoint.length).toBe(4);
  });
});
