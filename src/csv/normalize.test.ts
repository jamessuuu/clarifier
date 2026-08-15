import { describe, expect, it } from "vitest";

import { encodeCategorical, minMaxNormalize, rankNormalize } from "./normalize";

describe("rankNormalize — SPEC.md §3 Decision 2", () => {
  it("maps the maximum value to rank 1.0 regardless of magnitude (outlier can't dominate)", () => {
    const modest = rankNormalize([1, 2, 3, 4, 5]);
    const extreme = rankNormalize([1, 2, 3, 4, 5000]);
    expect(modest[4]).toBeCloseTo(1, 5);
    expect(extreme[4]).toBeCloseTo(1, 5); // same rank, despite 5000 vs 5
    expect(modest[0]).toBeCloseTo(extreme[0] ?? -1, 5); // the rest of the ranks are identical too
  });

  it("places missing values at rank 0.5, never 0 (median-rank strategy)", () => {
    const r = rankNormalize([1, null, 3, 5]);
    expect(r[1]).toBeCloseTo(0.5, 5);
  });

  it("gives tied values the same (averaged) rank", () => {
    const r = rankNormalize([1, 5, 5, 9]);
    expect(r[1]).toBeCloseTo(r[2] ?? -1, 5);
  });

  it("a single distinct value gets rank 0.5 (no meaningful ordering to report)", () => {
    const r = rankNormalize([7, 7, 7, 7]);
    for (let i = 0; i < 4; i++) expect(r[i]).toBeCloseTo(0.5, 5);
  });

  it("an all-missing column defaults every entry to 0.5", () => {
    const r = rankNormalize([null, null, null]);
    expect(Array.from(r)).toEqual([0.5, 0.5, 0.5]);
  });
});

describe("minMaxNormalize — the explicit 'raw' opt-in", () => {
  it("preserves relative magnitude, unlike rank: an outlier stretches everyone else toward 0", () => {
    const values = [1, 2, 3, 4, 5000];
    const r = minMaxNormalize(values);
    expect(r[4]).toBeCloseTo(1, 5);
    expect(r[0]).toBeCloseTo(0, 5);
    expect(r[3] ?? 1).toBeLessThan(0.01); // 4 is nearly indistinguishable from 1 given the 5000 outlier
  });

  it("maps missing to 0.5 and a constant column to 0.5 everywhere", () => {
    expect(minMaxNormalize([1, null, 3])[1]).toBeCloseTo(0.5, 5);
    expect(Array.from(minMaxNormalize([4, 4, 4]))).toEqual([0.5, 0.5, 0.5]);
  });
});

describe("encodeCategorical", () => {
  it("spreads categories evenly across [-1, 1] for charge, in first-appearance order", () => {
    const { charge, categories } = encodeCategorical(["b", "a", "c", "a", "b"]);
    expect(categories).toEqual(["b", "a", "c"]); // first-appearance order
    expect(charge[0]).toBeCloseTo(-1, 5); // "b" is first -> -1
    expect(charge[2]).toBeCloseTo(1, 5); // "c" is last -> +1
    expect(charge[1]).toBeCloseTo(0, 5); // "a" is the middle of 3 -> 0
  });

  it("a binary category is a clean -1/+1 split", () => {
    const { charge } = encodeCategorical(["x", "y", "x", "y"]);
    expect(charge[0]).toBeCloseTo(-1, 5);
    expect(charge[1]).toBeCloseTo(1, 5);
  });

  it("missing values get neutral charge (0) and mid ordinal (0.5)", () => {
    const { charge, values01 } = encodeCategorical(["a", null, "b"]);
    expect(charge[1]).toBe(0);
    expect(values01[1]).toBe(0.5);
  });

  it("a single category maps to charge 0 (no group to separate from)", () => {
    const { charge } = encodeCategorical(["only", "only", "only"]);
    expect(Array.from(charge)).toEqual([0, 0, 0]);
  });
});
