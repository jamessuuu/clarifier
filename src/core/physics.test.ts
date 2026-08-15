import { describe, expect, it } from "vitest";

import { computeAccelerations, hasNonFiniteValue, integrate, meanSpeed, temperatureAtStep, TEMPERATURE_FLOOR, boundingBoxDiagonal, type ForceField } from "./physics";
import { DEFAULT_FORCES } from "./types";

function field(n: number, overrides: Partial<ForceField> = {}): ForceField {
  return {
    n,
    mass: new Float32Array(n).fill(1),
    charge: new Float32Array(n),
    viscosity: new Float32Array(n),
    attraction: new Float32Array(0),
    attractionDims: 0,
    ...overrides,
  };
}

describe("temperatureAtStep", () => {
  it("starts at 1.0", () => {
    expect(temperatureAtStep(0)).toBeCloseTo(1.0, 5);
  });
  it("decays toward the floor and never crosses below it", () => {
    const values = [0, 45, 90, 180, 400, 2000].map(temperatureAtStep);
    for (let i = 1; i < values.length; i++) {
      expect(values[i]).toBeLessThanOrEqual(values[i - 1] ?? 1);
      expect(values[i]).toBeGreaterThanOrEqual(TEMPERATURE_FLOOR);
    }
    expect(temperatureAtStep(2000)).toBeCloseTo(TEMPERATURE_FLOOR, 3);
  });
  it("is at half-life 45 approximately halfway between 1.0 and the floor", () => {
    const mid = temperatureAtStep(45);
    expect(mid).toBeCloseTo(TEMPERATURE_FLOOR + (1 - TEMPERATURE_FLOOR) / 2, 3);
  });
});

describe("computeAccelerations", () => {
  it("centering force pulls a lone off-center particle toward the origin", () => {
    const f = field(1);
    const positions = new Float32Array([10, 0]);
    const out = new Float32Array(2);
    computeAccelerations(positions, f, DEFAULT_FORCES, 1, out);
    expect(out[0]).toBeLessThan(0); // pulled back toward x=0
    expect(out[1]).toBeCloseTo(0, 5);
  });

  it("obeys Newton's third law: pairwise force contributions are equal and opposite when masses match", () => {
    const f = field(2);
    const positions = new Float32Array([0, 0, 5, 0]);
    const out = new Float32Array(4);
    const forces = { ...DEFAULT_FORCES, centering: 0 }; // isolate the pairwise terms
    computeAccelerations(positions, f, forces, 1, out);
    expect(out[0]).toBeCloseTo(-(out[2] ?? 0), 5);
    expect(out[1]).toBeCloseTo(-(out[3] ?? 0), 5);
  });

  it("collision force repels two nearly-coincident particles", () => {
    const f = field(2);
    const positions = new Float32Array([0, 0, 0.1, 0]);
    const out = new Float32Array(4);
    const forces = { ...DEFAULT_FORCES, centering: 0, attraction: 0, charge: 0 };
    computeAccelerations(positions, f, forces, 1, out);
    // particle 0 pushed toward -x (away from particle 1), particle 1 pushed toward +x
    expect(out[0]).toBeLessThan(0);
    expect(out[2]).toBeGreaterThan(0);
  });

  it("never divides by zero when two particles occupy the exact same position", () => {
    const f = field(2);
    const positions = new Float32Array([3, 3, 3, 3]);
    const out = new Float32Array(4);
    computeAccelerations(positions, f, DEFAULT_FORCES, 1, out);
    expect(hasNonFiniteValue(out)).toBe(false);
  });

  it("charge: identical categories attract, different categories repel", () => {
    const sameGroup = field(2, { charge: new Float32Array([1, 1]) });
    const diffGroup = field(2, { charge: new Float32Array([1, -1]) });
    const positions = new Float32Array([0, 0, 4, 0]);
    const forces = { ...DEFAULT_FORCES, centering: 0, attraction: 0, collision: 0 };

    const outSame = new Float32Array(4);
    computeAccelerations(positions, sameGroup, forces, 1, outSame);
    // particle 0 pulled toward +x (toward particle 1) when same group
    expect(outSame[0]).toBeGreaterThan(0);

    const outDiff = new Float32Array(4);
    computeAccelerations(positions, diffGroup, forces, 1, outDiff);
    // particle 0 pushed toward -x (away from particle 1) when different groups
    expect(outDiff[0]).toBeLessThan(0);
  });

  it("attraction: similar rows (small dissimilarity) settle closer than dissimilar rows, all else equal", () => {
    const similar = field(2, { attraction: new Float32Array([0.5, 0.52]), attractionDims: 1 });
    const dissimilar = field(2, { attraction: new Float32Array([0.1, 0.9]), attractionDims: 1 });
    const positions = new Float32Array([0, 0, 10, 0]);
    const forces = { ...DEFAULT_FORCES, centering: 0, charge: 0, collision: 0 };

    const outSimilar = new Float32Array(4);
    computeAccelerations(positions, similar, forces, 1, outSimilar);
    const outDissimilar = new Float32Array(4);
    computeAccelerations(positions, dissimilar, forces, 1, outDissimilar);

    // Similar rows: at r=10 with near-zero rest length, force pulls together (+x on particle 0).
    expect(outSimilar[0]).toBeGreaterThan(0);
    // The pull for similar rows should be stronger than for dissimilar rows (larger rest length -> smaller stretch).
    expect(outSimilar[0]).toBeGreaterThan(outDissimilar[0] ?? 0);
  });
});

describe("integrate", () => {
  it("applies semi-implicit Euler: velocity updates before position, using the NEW velocity", () => {
    const f = field(1);
    const positions = new Float32Array([0, 0]);
    const velocities = new Float32Array([0, 0]);
    const accel = new Float32Array([10, 0]);
    const forces = { ...DEFAULT_FORCES, viscosityBase: 0 };
    integrate(positions, velocities, accel, f, forces, 1 / 60);
    // v = 0 + 10 * dt = 10/60; position should equal v*dt (using the NEW v), not 0.
    expect(velocities[0]).toBeCloseTo(10 / 60, 5);
    expect(positions[0]).toBeCloseTo((10 / 60) * (1 / 60), 6);
  });

  it("hard velocity clamp caps speed every step", () => {
    const f = field(1);
    const positions = new Float32Array([0, 0]);
    const velocities = new Float32Array([0, 0]);
    const accel = new Float32Array([1e6, 0]); // a force spike
    const forces = { ...DEFAULT_FORCES, viscosityBase: 0 };
    integrate(positions, velocities, accel, f, forces, 1 / 60);
    const speed = Math.sqrt((velocities[0] ?? 0) ** 2 + (velocities[1] ?? 0) ** 2);
    expect(speed).toBeLessThanOrEqual(60 + 1e-6); // MAX_SPEED
  });

  it("viscosity damps velocity", () => {
    const lowVis = field(1, { viscosity: new Float32Array([0]) });
    const highVis = field(1, { viscosity: new Float32Array([1]) });
    const posA = new Float32Array([0, 0]);
    const velA = new Float32Array([10, 0]);
    integrate(posA, velA, new Float32Array([0, 0]), lowVis, DEFAULT_FORCES, 1 / 60);

    const posB = new Float32Array([0, 0]);
    const velB = new Float32Array([10, 0]);
    integrate(posB, velB, new Float32Array([0, 0]), highVis, DEFAULT_FORCES, 1 / 60);

    expect(velB[0] ?? 0).toBeLessThan(velA[0] ?? 0);
  });
});

describe("meanSpeed / boundingBoxDiagonal", () => {
  it("meanSpeed is zero for stationary particles", () => {
    expect(meanSpeed(new Float32Array([0, 0, 0, 0]), 2)).toBe(0);
  });
  it("boundingBoxDiagonal is zero for a single point and positive for spread points", () => {
    expect(boundingBoxDiagonal(new Float32Array([1, 1]), 1)).toBe(0);
    expect(boundingBoxDiagonal(new Float32Array([0, 0, 3, 4]), 2)).toBeCloseTo(5, 5);
  });
});

describe("hasNonFiniteValue", () => {
  it("detects NaN and Infinity", () => {
    expect(hasNonFiniteValue(new Float32Array([1, 2, 3]))).toBe(false);
    expect(hasNonFiniteValue(new Float32Array([1, NaN, 3]))).toBe(true);
    expect(hasNonFiniteValue(new Float32Array([1, Infinity, 3]))).toBe(true);
  });
});
