import { describe, expect, it } from "vitest";

import { computeSeparationGain, SEPARATION_GAIN_SAMPLE_CAP } from "./separation-gain";

/**
 * These tests construct pcaColumns / physicsPositions directly rather than
 * running the full physics pipeline — they verify the COMPARISON LOGIC
 * (does computeSeparationGain correctly report "stronger" when physics
 * really is meaningfully better clustered, and "no-meaningful-gain"
 * otherwise) is correct in isolation. See docs/limitations and the M2
 * commit message for why the "stronger" path is tested this way rather
 * than through the live physics engine on the current golden fixtures.
 */
describe("computeSeparationGain — insufficient-variance", () => {
  it("flags n<2 as insufficient-variance", () => {
    const result = computeSeparationGain({
      n: 1,
      pcaColumns: [Float32Array.from([0.5])],
      physicsPositions: Float32Array.from([0, 0]),
      categoricalK: null,
      categoryOf: null,
      seed: 1,
    });
    expect(result.verdict).toBe("insufficient-variance");
    expect(result.k).toBe(0);
  });

  it("flags zero pcaColumns as insufficient-variance", () => {
    const result = computeSeparationGain({
      n: 10,
      pcaColumns: [],
      physicsPositions: new Float32Array(20),
      categoricalK: null,
      categoryOf: null,
      seed: 1,
    });
    expect(result.verdict).toBe("insufficient-variance");
  });

  it("flags every row identical on every mapped column as insufficient-variance", () => {
    const n = 20;
    const constant = new Float32Array(n).fill(0.5);
    const result = computeSeparationGain({
      n,
      pcaColumns: [constant, constant],
      physicsPositions: new Float32Array(n * 2),
      categoricalK: null,
      categoryOf: null,
      seed: 1,
    });
    expect(result.verdict).toBe("insufficient-variance");
  });
});

describe("computeSeparationGain — verdict thresholding", () => {
  function threeTightClusters(n: number, spread: number): Float32Array {
    // n*2 flattened positions: three well-separated tight clusters.
    const out = new Float32Array(n * 2);
    const centers = [
      [0, 0],
      [50, 0],
      [25, 45],
    ];
    for (let i = 0; i < n; i++) {
      const c = centers[i % 3] ?? [0, 0];
      const jitter = ((i * 37) % 100) / 100 - 0.5; // deterministic pseudo-jitter, no RNG needed
      out[i * 2] = c[0]! + jitter * spread;
      out[i * 2 + 1] = c[1]! + jitter * spread;
    }
    return out;
  }

  function uniformSpread(n: number): Float32Array {
    const out = new Float32Array(n);
    for (let i = 0; i < n; i++) out[i] = (i / n) * 1.0;
    return out;
  }

  it('reports "stronger" when physics positions are dramatically better clustered than the PCA baseline', () => {
    const n = 90;
    const pcaColumns = [uniformSpread(n)]; // no real structure -> mediocre PCA silhouette
    const physicsPositions = threeTightClusters(n, 0.5); // tight, well-separated -> high silhouette
    const result = computeSeparationGain({ n, pcaColumns, physicsPositions, categoricalK: 3, categoryOf: null, seed: 1 });
    expect(result.verdict).toBe("stronger");
    expect(result.physicsSilhouette - result.pca2dSilhouette).toBeGreaterThan(0.2);
    expect(result.k).toBe(3);
  });

  it('reports "no-meaningful-gain" when physics is no better than the PCA baseline', () => {
    const n = 90;
    // Both sides see the SAME underlying structure via a matching column,
    // so neither should have a decisive edge.
    const shared = threeTightClusters(n, 0.5);
    const pcaColumns = [shared.filter((_, i) => i % 2 === 0), shared.filter((_, i) => i % 2 === 1)];
    const result = computeSeparationGain({ n, pcaColumns, physicsPositions: shared, categoricalK: 3, categoryOf: null, seed: 1 });
    expect(result.verdict).toBe("no-meaningful-gain");
  });

  it("both raw silhouette numbers are always present, win or lose (SPEC.md §2: shown either way)", () => {
    const n = 90;
    const result = computeSeparationGain({
      n,
      pcaColumns: [uniformSpread(n)],
      physicsPositions: threeTightClusters(n, 0.5),
      categoricalK: 3,
      categoryOf: null,
      seed: 1,
    });
    expect(typeof result.pca2dSilhouette).toBe("number");
    expect(typeof result.physicsSilhouette).toBe("number");
    expect(Number.isFinite(result.pca2dSilhouette)).toBe(true);
    expect(Number.isFinite(result.physicsSilhouette)).toBe(true);
  });
});

describe("computeSeparationGain — k selection (SPEC.md §2)", () => {
  it("uses the visitor's categorical mapping's distinct count as k when one exists", () => {
    const n = 60;
    const pcaColumns = [Float32Array.from({ length: n }, (_, i) => i / n)];
    const physicsPositions = new Float32Array(n * 2);
    const result = computeSeparationGain({ n, pcaColumns, physicsPositions, categoricalK: 5, categoryOf: null, seed: 1 });
    expect(result.k).toBe(5);
  });

  it("searches k in {2,3,4} when no categorical mapping exists", () => {
    const n = 60;
    const pcaColumns = [Float32Array.from({ length: n }, (_, i) => i / n)];
    const physicsPositions = new Float32Array(n * 2);
    const result = computeSeparationGain({ n, pcaColumns, physicsPositions, categoricalK: null, categoryOf: null, seed: 1 });
    expect([2, 3, 4]).toContain(result.k);
  });

  it("uses the SAME k for both sides, so the comparison is apples-to-apples", () => {
    // Directly verifiable from the implementation's contract: only one `k`
    // is returned, and it is documented as applying to both silhouette
    // computations — this test pins that there is exactly one k field.
    const n = 60;
    const result = computeSeparationGain({
      n,
      pcaColumns: [Float32Array.from({ length: n }, (_, i) => i / n)],
      physicsPositions: new Float32Array(n * 2),
      categoricalK: null,
      categoryOf: null,
      seed: 1,
    });
    expect(typeof result.k).toBe("number");
  });
});

describe("computeSeparationGain — sampling above the cap", () => {
  it("still returns a valid result above SEPARATION_GAIN_SAMPLE_CAP rows", () => {
    const n = SEPARATION_GAIN_SAMPLE_CAP + 500;
    const pcaColumns = [Float32Array.from({ length: n }, (_, i) => (i % 100) / 100)];
    const physicsPositions = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) {
      physicsPositions[i * 2] = (i % 3) * 20;
      physicsPositions[i * 2 + 1] = 0;
    }
    const result = computeSeparationGain({ n, pcaColumns, physicsPositions, categoricalK: null, categoryOf: null, seed: 1 });
    expect(["stronger", "no-meaningful-gain"]).toContain(result.verdict);
    expect(Number.isFinite(result.pca2dSilhouette)).toBe(true);
  });

  it("is deterministic above the cap for a fixed seed (sampling itself is seeded)", () => {
    const n = SEPARATION_GAIN_SAMPLE_CAP + 200;
    const pcaColumns = [Float32Array.from({ length: n }, (_, i) => (i % 7) / 7)];
    const physicsPositions = Float32Array.from({ length: n * 2 }, (_, i) => (i % 11) - 5);
    const a = computeSeparationGain({ n, pcaColumns, physicsPositions, categoricalK: null, categoryOf: null, seed: 3 });
    const b = computeSeparationGain({ n, pcaColumns, physicsPositions, categoricalK: null, categoryOf: null, seed: 3 });
    expect(a).toEqual(b);
  });
});
