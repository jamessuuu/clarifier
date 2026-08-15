/**
 * mulberry32 — the program's own seeded-PRNG convention (never Math.random,
 * matching scripts/brand.mjs's determinism discipline). SPEC.md §13: given a
 * fixed seed, the physics core must produce an exact, reproducible result.
 */
export type Rng = () => number;

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return function rng(): number {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Uniform float in [min, max). */
export function rngRange(rng: Rng, min: number, max: number): number {
  return min + rng() * (max - min);
}

/** Standard normal via Box-Muller, driven by the same seeded rng (deterministic). */
export function rngGaussian(rng: Rng, mean = 0, stddev = 1): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  const mag = Math.sqrt(-2.0 * Math.log(u));
  return mean + stddev * mag * Math.cos(2.0 * Math.PI * v);
}
