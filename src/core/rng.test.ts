import { describe, expect, it } from "vitest";

import { mulberry32, rngGaussian, rngRange } from "./rng";

describe("mulberry32", () => {
  it("is deterministic: same seed produces the same sequence", () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    const seqA = Array.from({ length: 20 }, () => a());
    const seqB = Array.from({ length: 20 }, () => b());
    expect(seqA).toEqual(seqB);
  });

  it("different seeds produce different sequences", () => {
    const a = mulberry32(1);
    const b = mulberry32(2);
    const seqA = Array.from({ length: 10 }, () => a());
    const seqB = Array.from({ length: 10 }, () => b());
    expect(seqA).not.toEqual(seqB);
  });

  it("produces values in [0, 1)", () => {
    const rng = mulberry32(7);
    for (let i = 0; i < 1000; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("rngRange stays within [min, max)", () => {
    const rng = mulberry32(9);
    for (let i = 0; i < 500; i++) {
      const v = rngRange(rng, -5, 5);
      expect(v).toBeGreaterThanOrEqual(-5);
      expect(v).toBeLessThan(5);
    }
  });

  it("rngGaussian is deterministic for a fixed seed", () => {
    const a = mulberry32(3);
    const b = mulberry32(3);
    const seqA = Array.from({ length: 10 }, () => rngGaussian(a));
    const seqB = Array.from({ length: 10 }, () => rngGaussian(b));
    expect(seqA).toEqual(seqB);
  });
});
