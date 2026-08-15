import { describe, expect, it } from "vitest";

import { buildColumnMappings } from "@/csv/infer";
import { resolveForceField } from "@/csv/resolve-forces";

import { hashRow } from "./hash";
import { type ForceField } from "./physics";
import { Simulation, initPositions } from "./simulation";
import { DEFAULT_FORCES } from "./types";

function makeField(n: number, attractionDims = 0): ForceField {
  return {
    n,
    mass: new Float32Array(n).fill(1),
    charge: new Float32Array(n),
    viscosity: new Float32Array(n),
    attraction: new Float32Array(n * attractionDims),
    attractionDims,
  };
}

describe("initPositions", () => {
  it("is deterministic for a fixed seed", () => {
    const a = initPositions(50, 7);
    const b = initPositions(50, 7);
    expect(Array.from(a.positions)).toEqual(Array.from(b.positions));
  });
  it("differs for different seeds", () => {
    const a = initPositions(50, 7);
    const b = initPositions(50, 8);
    expect(Array.from(a.positions)).not.toEqual(Array.from(b.positions));
  });
});

describe("Simulation determinism (SPEC.md §13)", () => {
  it("record-twice-is-identical: same seed, same config -> identical output at every step", () => {
    const field = makeField(30, 1);
    for (let i = 0; i < 30; i++) field.attraction[i] = (i % 3) / 2;

    const simA = new Simulation({ seed: 123, dt: 1 / 60, forces: DEFAULT_FORCES }, field);
    const simB = new Simulation({ seed: 123, dt: 1 / 60, forces: DEFAULT_FORCES }, field);
    for (let step = 0; step < 200; step++) {
      simA.advance();
      simB.advance();
    }
    expect(Array.from(simA.positions)).toEqual(Array.from(simB.positions));
    expect(simA.step).toBe(simB.step);
    expect(simA.converged).toBe(simB.converged);
  });

  it("is bit-identical whether run in one runToConvergence call or stepped one advance() at a time", () => {
    const field = makeField(20, 1);
    for (let i = 0; i < 20; i++) field.attraction[i] = i / 19;

    const simA = new Simulation({ seed: 5, dt: 1 / 60, forces: DEFAULT_FORCES }, field);
    simA.runToConvergence(1000);

    const simB = new Simulation({ seed: 5, dt: 1 / 60, forces: DEFAULT_FORCES }, field);
    while (!simB.converged && simB.step < 1000) simB.advance();

    expect(Array.from(simA.positions)).toEqual(Array.from(simB.positions));
    expect(simA.step).toBe(simB.step);
  });
});

describe("Simulation stability contracts (SPEC.md §12)", () => {
  it("freezes at the last stable frame and sets unstable when positions would go non-finite", () => {
    const field = makeField(2);
    const sim = new Simulation({ seed: 1, dt: 1 / 60, forces: DEFAULT_FORCES }, field);
    // Force a NaN into the live state directly to exercise the guard deterministically.
    sim.positions[0] = NaN;
    sim.advance();
    expect(sim.unstable).toBe(true);
    expect(Number.isFinite(sim.positions[0])).toBe(true); // restored to the last stable snapshot
  });

  it("perturb() re-injects energy and resumes stepping under the identical convergence rule", () => {
    const field = makeField(10, 1);
    for (let i = 0; i < 10; i++) field.attraction[i] = i / 9;
    const sim = new Simulation({ seed: 2, dt: 1 / 60, forces: DEFAULT_FORCES }, field);
    // An evenly-spaced colinear attraction chain (no charge/mass variation to
    // help it settle) is a genuinely slow-converging shape — measured at
    // step 4546 for this exact seed/config, vs. a few hundred steps for a
    // realistic multi-cluster dataset (blobs-3-known settles ~330-360). The
    // budget below is generous on purpose; this is a real physical property
    // of the fixture, not a bug being masked.
    sim.runToConvergence(8000);
    expect(sim.converged).toBe(true);
    const stepAtConvergence = sim.step;

    sim.perturb(0, 5, 5);
    expect(sim.converged).toBe(false);
    sim.advance(); // the exact same advance() method — no special-case path
    expect(sim.step).toBe(stepAtConvergence + 1);

    sim.runToConvergence(stepAtConvergence + 8000);
    expect(sim.converged).toBe(true);
  });

  it("advance() no-ops once converged (per-settle-step dispatch pauses, SPEC.md §5)", () => {
    const field = makeField(5);
    const sim = new Simulation({ seed: 1, dt: 1 / 60, forces: { ...DEFAULT_FORCES, attraction: 0, charge: 0, centering: 0 } }, field);
    sim.runToConvergence(500);
    expect(sim.converged).toBe(true);
    const stepAtConvergence = sim.step;
    const positionsSnapshot = Array.from(sim.positions);
    sim.advance();
    sim.advance();
    expect(sim.step).toBe(stepAtConvergence);
    expect(Array.from(sim.positions)).toEqual(positionsSnapshot);
  });
});

describe("shuffle-input-row-order-is-identical (SPEC.md §13, modulo row identity)", () => {
  it("a row's settled position depends on ITS OWN content, not its position in the array — reordering the CSV reorders the output the same way", () => {
    // Exercises the real pipeline (parse -> infer -> resolve -> rowSeeds via
    // content hash -> Simulation), not a hand-built ForceField: row identity
    // only exists at the CSV-row level, and initPositions() only becomes
    // order-independent when it is seeded from that content hash (see
    // core/hash.ts + simulation.ts's initPositions "rowSeeds" parameter).
    const n = 24;
    const rows = Array.from({ length: n }, (_, i) => [`id-${String(i)}`, String((i % 4) / 3)]);
    const headers = ["id", "value"];

    function run(inputRows: (string | null)[][]) {
      const { mappings, stats } = buildColumnMappings(headers, inputRows);
      const { field } = resolveForceField(mappings, stats, inputRows.length);
      const rowSeeds = new Uint32Array(inputRows.map((r) => hashRow(r)));
      const sim = new Simulation({ seed: 11, dt: 1 / 60, forces: DEFAULT_FORCES, rowSeeds }, field);
      sim.runToConvergence(2000);
      const byId = new Map<string, [number, number]>();
      inputRows.forEach((row, idx) => {
        const id = row[0];
        if (id) byId.set(id, [sim.positions[idx * 2] ?? 0, sim.positions[idx * 2 + 1] ?? 0]);
      });
      return byId;
    }

    const identityResult = run(rows);
    const shuffledRows = [...rows].reverse();
    const shuffledResult = run(shuffledRows);

    expect(shuffledResult.size).toBe(identityResult.size);
    const tolerance = 1e-4;
    for (const [id, [ax, ay]] of identityResult) {
      const b = shuffledResult.get(id);
      expect(b, `row ${id} missing from shuffled result`).toBeDefined();
      const [bx, by] = b ?? [NaN, NaN];
      expect(Math.abs(ax - bx)).toBeLessThan(tolerance);
      expect(Math.abs(ay - by)).toBeLessThan(tolerance);
    }
  });
});
