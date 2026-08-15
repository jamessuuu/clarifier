import { boundingBoxDiagonal, computeAccelerations, applySpringEdges, hasNonFiniteValue, INITIAL_SPAWN_RADIUS, integrate, meanSpeed, temperatureAtStep, type ForceField } from "./physics";
import { ConvergenceDetector } from "./convergence";
import { mulberry32 } from "./rng";
import type { ForceConfig, SpringEdge } from "./types";

/**
 * SPEC.md §13's shuffle-invariance eval requires that a row's initial
 * position depend on the row's own identity, not its array index — so
 * reordering the input reorders the output instead of changing anyone's
 * trajectory. When `rowSeeds` is supplied (the CSV-driven path always
 * supplies one, derived from each row's own content via core/hash.ts), each
 * particle gets an INDEPENDENT mulberry32 stream seeded by `seed` combined
 * with that row's own stable hash. Without it (bare core-level tests that
 * construct a ForceField directly, with no CSV row content to hash), this
 * falls back to one shared sequential stream — deterministic, but
 * order-dependent, which is fine for tests that don't exercise shuffling.
 */
export function initPositions(n: number, seed: number, rowSeeds?: Uint32Array): { positions: Float32Array; velocities: Float32Array } {
  const positions = new Float32Array(n * 2);
  const velocities = new Float32Array(n * 2);
  const sharedRng = rowSeeds ? null : mulberry32(seed);
  for (let i = 0; i < n; i++) {
    const rng = sharedRng ?? mulberry32((seed ^ (rowSeeds?.[i] ?? 0)) >>> 0);
    // uniform sampling within a disk: r = R*sqrt(u), theta = 2*pi*v
    const r = INITIAL_SPAWN_RADIUS * Math.sqrt(rng());
    const theta = 2 * Math.PI * rng();
    positions[i * 2] = r * Math.cos(theta);
    positions[i * 2 + 1] = r * Math.sin(theta);
  }
  return { positions, velocities };
}

export interface SimulationConfig {
  seed: number;
  dt: number;
  forces: ForceConfig;
  springEdges?: SpringEdge[];
  /** Per-row stable seed contribution (core/hash.ts), for order-independent initial placement. See initPositions. */
  rowSeeds?: Uint32Array;
}

/**
 * The one stateful orchestrator core/'s pure functions compose into — this
 * is what CI's determinism eval instantiates and what SPEC.md §7 means by
 * "the one implementation... the WGSL kernel must agree with." No DOM, no
 * navigator.gpu, no timers: advance() steps exactly one fixed dt, and the
 * caller (a requestAnimationFrame accumulator loop, or a headless
 * runToConvergence call for the static rung / evals) decides when to call it.
 */
export class Simulation {
  readonly field: ForceField;
  readonly forces: ForceConfig;
  readonly dt: number;
  readonly springEdges: readonly SpringEdge[];
  readonly springRestLength = 4;

  positions: Float32Array;
  velocities: Float32Array;
  step = 0;
  temperature = 1;
  converged = false;
  unstable = false;
  keHistory: number[] = [];

  private readonly accel: Float32Array;
  private readonly lastStablePositions: Float32Array;
  private readonly lastStableVelocities: Float32Array;
  private readonly detector = new ConvergenceDetector();

  constructor(config: SimulationConfig, field: ForceField) {
    this.field = field;
    this.forces = config.forces;
    this.dt = config.dt;
    this.springEdges = config.springEdges ?? [];
    const { positions, velocities } = initPositions(field.n, config.seed, config.rowSeeds);
    this.positions = positions;
    this.velocities = velocities;
    this.lastStablePositions = positions.slice();
    this.lastStableVelocities = velocities.slice();
    this.accel = new Float32Array(field.n * 2);

    // A layout of 0 or 1 particles has no pairwise force by construction —
    // there is nothing for attraction/charge/collision to settle, only the
    // deliberately weak centering spring (SPEC.md §4: "weak, constant") with
    // nothing to counterbalance it. Measured: that combination decays with
    // roughly an 8000-step half-life, which would never satisfy §4's
    // convergence rule in any reasonable time — not a meaningful "still
    // settling" state, just an edge case the rule wasn't shaped for. A
    // single point has nothing to be relatively positioned against, so it is
    // trivially already settled.
    if (field.n <= 1) {
      this.converged = true;
    }
  }

  /**
   * Advances exactly one fixed-dt step. No-ops once converged or unstable —
   * SPEC.md §5 "per frame vs per settle-step": while unconverged the force
   * dispatch runs every frame; once converged it is skipped, and only
   * rendering continues (the caller's render loop, not this method, is what
   * keeps drawing every frame from the frozen positions).
   */
  advance(): void {
    if (this.converged || this.unstable) return;

    this.temperature = temperatureAtStep(this.step);
    computeAccelerations(this.positions, this.field, this.forces, this.temperature, this.accel);
    if (this.springEdges.length > 0) {
      applySpringEdges(this.positions, this.field, this.forces, this.springEdges, this.springRestLength, this.accel);
    }
    integrate(this.positions, this.velocities, this.accel, this.field, this.forces, this.dt);
    this.step++;

    // SPEC.md §12: hard NaN/Infinity guard every step. On detection, freeze
    // at the last stable frame and never render garbage positions.
    if (hasNonFiniteValue(this.positions) || hasNonFiniteValue(this.velocities)) {
      this.unstable = true;
      this.positions.set(this.lastStablePositions);
      this.velocities.set(this.lastStableVelocities);
      console.warn(`clarifier: simulation became unstable at step ${String(this.step)} — showing the last stable frame.`);
      return;
    }
    this.lastStablePositions.set(this.positions);
    this.lastStableVelocities.set(this.velocities);

    const speed = meanSpeed(this.velocities, this.field.n);
    const diagonal = boundingBoxDiagonal(this.positions, this.field.n);
    const { converged } = this.detector.step(speed, diagonal);

    this.keHistory.push(speed);
    if (this.keHistory.length > 120) this.keHistory.shift();

    if (converged) this.converged = true;
  }

  /**
   * Re-injects energy at a single particle (a visitor drag) and resumes
   * stepping under the identical convergence rule — SPEC.md §4/§12: "no
   * special-case path." `advance()` is unchanged; only the converged flag
   * and the detector's own debounce window reset.
   */
  perturb(index: number, dx: number, dy: number): void {
    if (index < 0 || index >= this.field.n) return;
    const ix = index * 2;
    const iy = index * 2 + 1;
    this.positions[ix] = (this.positions[ix] ?? 0) + dx;
    this.positions[iy] = (this.positions[iy] ?? 0) + dy;
    this.converged = false;
    this.unstable = false;
    this.detector.reset();
  }

  /** Headless solve to convergence, no per-frame render — the static rung (SPEC.md §6.3) and CI evals both use this directly. */
  runToConvergence(maxSteps: number): void {
    while (!this.converged && !this.unstable && this.step < maxSteps) {
      this.advance();
    }
  }
}
