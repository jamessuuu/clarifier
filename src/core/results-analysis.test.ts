import { describe, expect, it } from "vitest";

import { analyzeResults, type NamedNumericColumn } from "./results-analysis";

describe("analyzeResults", () => {
  function twoTightClusters(n: number): Float32Array {
    const out = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) {
      const cx = i % 2 === 0 ? 0 : 50;
      out[i * 2] = cx + ((i * 7) % 10) * 0.1;
      out[i * 2 + 1] = ((i * 13) % 10) * 0.1;
    }
    return out;
  }

  it("finds the requested number of clusters and reports sizes summing to n", () => {
    const n = 40;
    const positions = twoTightClusters(n);
    const columns: NamedNumericColumn[] = [{ name: "score", rawValues: Array.from({ length: n }, (_, i) => (i % 2 === 0 ? 10 : 90)) }];
    const result = analyzeResults(positions, n, 2, columns);
    expect(result.clusterCount).toBe(2);
    const totalSize = result.clusters.reduce((a, c) => a + c.size, 0);
    expect(totalSize).toBe(n);
  });

  it("reports defining columns with a real min/max range", () => {
    const n = 40;
    const positions = twoTightClusters(n);
    const columns: NamedNumericColumn[] = [{ name: "score", rawValues: Array.from({ length: n }, (_, i) => (i % 2 === 0 ? 10 : 90)) }];
    const result = analyzeResults(positions, n, 2, columns);
    for (const cluster of result.clusters) {
      expect(cluster.definingColumns.length).toBeGreaterThan(0);
      const col = cluster.definingColumns[0];
      expect(col?.min).toBeLessThanOrEqual(col?.max ?? 0);
    }
  });

  it("returns an empty analysis for n=0", () => {
    const result = analyzeResults(new Float32Array(0), 0, 3, []);
    expect(result.clusterCount).toBe(0);
    expect(result.clusters).toEqual([]);
    expect(result.outlierRowIndices).toEqual([]);
  });

  it("flags a point far from every cluster as an outlier", () => {
    const n = 20;
    const positions = new Float32Array((n + 1) * 2);
    for (let i = 0; i < n; i++) {
      positions[i * 2] = i % 2 === 0 ? 0 : 20;
      positions[i * 2 + 1] = 0;
    }
    // one far-away point
    positions[n * 2] = 500;
    positions[n * 2 + 1] = 500;
    const result = analyzeResults(positions, n + 1, 2, []);
    expect(result.outlierRowIndices).toContain(n);
  });
});
