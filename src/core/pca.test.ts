import { describe, expect, it } from "vitest";

import { computePca2D } from "./pca";

describe("computePca2D", () => {
  it("returns empty output for zero columns or zero rows", () => {
    expect(computePca2D([], 5).dims).toBe(0);
    expect(computePca2D([new Float32Array(0)], 0).dims).toBe(0);
  });

  it("recovers the dominant axis of a clearly elongated 2D point cloud", () => {
    // Points scattered along the line y=x (plus tiny noise on the perpendicular axis).
    const n = 50;
    const colX = new Float32Array(n);
    const colY = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const t = (i - n / 2) * 0.5;
      colX[i] = t;
      colY[i] = t + (i % 2 === 0 ? 0.01 : -0.01); // negligible perpendicular noise
    }
    const result = computePca2D([colX, colY], n);
    // PC1 should explain almost all the variance (the data is ~1D).
    expect(result.varianceExplained[0]).toBeGreaterThan(0.99);
  });

  it("with a single input column, PC2 carries zero variance (nothing left to explain)", () => {
    const n = 20;
    const col = Float32Array.from({ length: n }, (_, i) => i);
    const result = computePca2D([col], n);
    expect(result.dims).toBe(1);
    expect(result.varianceExplained[1]).toBe(0);
  });

  it("projected output has n*2 entries", () => {
    const n = 10;
    const a = Float32Array.from({ length: n }, (_, i) => i);
    const b = Float32Array.from({ length: n }, (_, i) => (i % 3) - 1);
    const result = computePca2D([a, b], n);
    expect(result.projected.length).toBe(n * 2);
  });

  it("is deterministic across repeated calls (no RNG involved)", () => {
    const n = 30;
    const a = Float32Array.from({ length: n }, (_, i) => Math.sin(i));
    const b = Float32Array.from({ length: n }, (_, i) => Math.cos(i * 1.3));
    const c = Float32Array.from({ length: n }, (_, i) => i % 5);
    const r1 = computePca2D([a, b, c], n);
    const r2 = computePca2D([a, b, c], n);
    expect(Array.from(r1.projected)).toEqual(Array.from(r2.projected));
  });
});
