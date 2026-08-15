import type { ForceConfig, SpringEdge } from "./types";

/**
 * Flattened, typed-array force inputs resolved from ColumnMapping (see
 * resolve-forces.ts). Kept separate from ColumnMapping/CSV concerns so this
 * module stays pure numeric code — the same shape the WGSL kernel mirrors.
 */
export interface ForceField {
  n: number;
  mass: Float32Array; // n, always > 0
  charge: Float32Array; // n, in [-1,1], 0 if unmapped
  viscosity: Float32Array; // n, in [0,1], 0 if unmapped
  attraction: Float32Array; // n * attractionDims, rank-normalized per column
  attractionDims: number;
}

// Sim-unit constants. Positions/velocities live in an abstract coordinate
// space (not pixels); the renderer fits the bounding box to the viewport.
// Chosen so a few hundred to a few thousand particles spawned in
// INITIAL_SPAWN_RADIUS produce a mean inter-particle spacing comparable to
// EPS2's softening length and COLLISION_RADIUS — verified empirically
// (evals/ + scripts/tune-check, not just picked blind).
export const INITIAL_SPAWN_RADIUS = 40;
export const EPS2 = 1.0; // force-denominator softening length² (SPEC.md §4.2: "r² + ε, never bare r²")
export const COLLISION_RADIUS = 1.4;
export const ATTRACTION_REST_SCALE = 26; // similarity-1 pairs rest near 0; similarity-0 pairs rest near this
export const VISCOSITY_SCALE = 0.5;
export const MAX_SPEED = 60; // sim-units/s, hard clamp (SPEC.md §4: "no single force spike ejects a particle to infinity")

/**
 * Simulated annealing (SPEC.md §4): attraction/charge magnitudes are
 * multiplied by a temperature decaying exponentially from 1.0 toward a 0.15
 * floor with a 45-step half-life. This is what lets the layout cool into one
 * stable configuration instead of oscillating between two.
 */
export const TEMPERATURE_FLOOR = 0.15;
export const TEMPERATURE_HALF_LIFE = 45;

export function temperatureAtStep(step: number): number {
  const decaying = (1 - TEMPERATURE_FLOOR) * Math.pow(0.5, step / TEMPERATURE_HALF_LIFE);
  return TEMPERATURE_FLOOR + decaying;
}

/**
 * Accumulates acceleration (force / mass) for every particle into `out`
 * (length n*2, zeroed on entry). Naive all-pairs O(n²) — SPEC.md §5's
 * naive-below-5000 tier; the >5000 spatial-grid tier is a separate module
 * (spatial-grid.ts) that calls the same pairwise math over a neighbour list
 * instead of every pair, so the two paths cannot silently diverge in what
 * "one pairwise interaction" means.
 *
 * Force model, each documented because SPEC.md §4 names the forces but not
 * their exact formulas — these are the implementation decisions:
 *
 * - Centering: F = -centering * position (a weak linear spring to the
 *   origin, SPEC.md §4 "weak, constant, keeps the composition framed").
 * - Attraction: a Hookean spring per pair whose REST LENGTH is proportional
 *   to dissimilarity on the attraction-mapped column(s) (Euclidean distance
 *   in rank-normalized space). Similar rows (dissimilarity -> 0) rest
 *   touching; dissimilar rows rest apart. This is what makes "clustering"
 *   literal: it is a physically-settled multidimensional-scaling embedding.
 * - Charge: SAME category attracts (cohesion), DIFFERENT category repels,
 *   scaled by how far apart the two categories' assigned charge values are,
 *   with a 1/(r²+ε) falloff. This is the inverse of literal electrostatics
 *   (where like repels) because SPEC.md §2 requires charge to "physically
 *   repel its groups apart" — real same-repels/opposite-attracts physics
 *   would instead pull opposite groups together, which is the wrong result.
 * - Collision: short-range, fixed-strength, quadratic falloff repulsion
 *   inside COLLISION_RADIUS — never user-mapped (SPEC.md §4).
 *
 * Every pairwise force is divided by each particle's own mass before
 * accumulating (F = ma => a = F/m): higher rank-normalized mass makes a row
 * more inert, not a stronger attractor of others — SPEC.md names mass as an
 * input column, not a Newtonian-gravity generator.
 */
export function computeAccelerations(positions: Float32Array, field: ForceField, forces: ForceConfig, temperature: number, out: Float32Array): void {
  const n = field.n;
  out.fill(0);
  const dims = field.attractionDims;

  for (let i = 0; i < n; i++) {
    const xi = positions[i * 2] ?? 0;
    const yi = positions[i * 2 + 1] ?? 0;
    const mi = field.mass[i] ?? 1;
    out[i * 2] = (out[i * 2] ?? 0) + (-forces.centering * xi) / mi;
    out[i * 2 + 1] = (out[i * 2 + 1] ?? 0) + (-forces.centering * yi) / mi;
  }

  for (let i = 0; i < n; i++) {
    const xi = positions[i * 2] ?? 0;
    const yi = positions[i * 2 + 1] ?? 0;
    const mi = field.mass[i] ?? 1;
    for (let j = i + 1; j < n; j++) {
      const xj = positions[j * 2] ?? 0;
      const yj = positions[j * 2 + 1] ?? 0;
      const mj = field.mass[j] ?? 1;
      const dx = xi - xj;
      const dy = yi - yj;
      const r2 = dx * dx + dy * dy;
      const r = Math.sqrt(r2) || 1e-6;
      const ux = dx / r;
      const uy = dy / r;

      // --- attraction: spring toward a dissimilarity-scaled rest length ---
      if (forces.attraction !== 0) {
        let dissim = 0;
        if (dims > 0) {
          let sumsq = 0;
          for (let k = 0; k < dims; k++) {
            const ai = field.attraction[i * dims + k] ?? 0;
            const aj = field.attraction[j * dims + k] ?? 0;
            const d = ai - aj;
            sumsq += d * d;
          }
          dissim = Math.sqrt(sumsq / dims);
        }
        const restLength = dissim * ATTRACTION_REST_SCALE;
        const stretch = r - restLength;
        const fAttract = forces.attraction * temperature * stretch;
        out[i * 2] = (out[i * 2] ?? 0) + (-ux * fAttract) / mi;
        out[i * 2 + 1] = (out[i * 2 + 1] ?? 0) + (-uy * fAttract) / mi;
        out[j * 2] = (out[j * 2] ?? 0) + (ux * fAttract) / mj;
        out[j * 2 + 1] = (out[j * 2 + 1] ?? 0) + (uy * fAttract) / mj;
      }

      // --- charge: same category attracts, different category repels ---
      if (forces.charge !== 0) {
        const ci = field.charge[i] ?? 0;
        const cj = field.charge[j] ?? 0;
        const sameGroup = ci === cj;
        const diff = Math.abs(ci - cj);
        const sign = sameGroup ? -1 : 1;
        const magnitude = sameGroup ? 0.15 : Math.max(diff, 0.35);
        const fCharge = (sign * forces.charge * temperature * magnitude) / (r2 + EPS2);
        out[i * 2] = (out[i * 2] ?? 0) + (ux * fCharge) / mi;
        out[i * 2 + 1] = (out[i * 2 + 1] ?? 0) + (uy * fCharge) / mi;
        out[j * 2] = (out[j * 2] ?? 0) + (-ux * fCharge) / mj;
        out[j * 2 + 1] = (out[j * 2 + 1] ?? 0) + (-uy * fCharge) / mj;
      }

      // --- collision: short-range, fixed, quadratic falloff ---
      if (r < COLLISION_RADIUS) {
        const overlap = (COLLISION_RADIUS - r) / COLLISION_RADIUS;
        const fCollision = forces.collision * overlap * overlap;
        out[i * 2] = (out[i * 2] ?? 0) + (ux * fCollision) / mi;
        out[i * 2 + 1] = (out[i * 2 + 1] ?? 0) + (uy * fCollision) / mi;
        out[j * 2] = (out[j * 2] ?? 0) - (ux * fCollision) / mj;
        out[j * 2 + 1] = (out[j * 2 + 1] ?? 0) - (uy * fCollision) / mj;
      }
    }
  }

  // --- optional Hookean spring, explicit pairs only (SPEC.md §3/§4) ---
  if (forces.spring !== 0) {
    // handled by the caller via applySpringEdges (sparse; not part of the
    // O(n²) sweep) — kept as a separate function so it stays cheap when
    // there are no edges, which is the default (spring "off by default").
  }
}

export function applySpringEdges(positions: Float32Array, field: ForceField, forces: ForceConfig, edges: readonly SpringEdge[], restLength: number, out: Float32Array): void {
  if (forces.spring === 0 || edges.length === 0) return;
  for (const edge of edges) {
    const i = edge.from;
    const j = edge.to;
    if (i < 0 || j < 0 || i >= field.n || j >= field.n || i === j) continue;
    const xi = positions[i * 2] ?? 0;
    const yi = positions[i * 2 + 1] ?? 0;
    const xj = positions[j * 2] ?? 0;
    const yj = positions[j * 2 + 1] ?? 0;
    const mi = field.mass[i] ?? 1;
    const mj = field.mass[j] ?? 1;
    const dx = xi - xj;
    const dy = yi - yj;
    const r = Math.sqrt(dx * dx + dy * dy) || 1e-6;
    const ux = dx / r;
    const uy = dy / r;
    const stretch = r - restLength;
    const fSpring = forces.spring * stretch;
    out[i * 2] = (out[i * 2] ?? 0) + (-ux * fSpring) / mi;
    out[i * 2 + 1] = (out[i * 2 + 1] ?? 0) + (-uy * fSpring) / mi;
    out[j * 2] = (out[j * 2] ?? 0) + (ux * fSpring) / mj;
    out[j * 2 + 1] = (out[j * 2 + 1] ?? 0) + (uy * fSpring) / mj;
  }
}

/**
 * Semi-implicit (symplectic) Euler, per SPEC.md §4: velocity updates from
 * acceleration first, THEN position updates from the new velocity. Applies
 * per-particle viscosity damping (mapped column + a small baseline) and the
 * hard velocity clamp before integrating position.
 */
export function integrate(positions: Float32Array, velocities: Float32Array, accelerations: Float32Array, field: ForceField, forces: ForceConfig, dt: number): void {
  const n = field.n;
  for (let i = 0; i < n; i++) {
    const ix = i * 2;
    const iy = i * 2 + 1;
    let vx = (velocities[ix] ?? 0) + (accelerations[ix] ?? 0) * dt;
    let vy = (velocities[iy] ?? 0) + (accelerations[iy] ?? 0) * dt;

    const damp = 1 - Math.min(0.98, forces.viscosityBase + (field.viscosity[i] ?? 0) * VISCOSITY_SCALE);
    vx *= damp;
    vy *= damp;

    const speed = Math.sqrt(vx * vx + vy * vy);
    if (speed > MAX_SPEED) {
      const scale = MAX_SPEED / speed;
      vx *= scale;
      vy *= scale;
    }

    velocities[ix] = vx;
    velocities[iy] = vy;
    positions[ix] = (positions[ix] ?? 0) + vx * dt;
    positions[iy] = (positions[iy] ?? 0) + vy * dt;
  }
}

/** Mean particle speed this step — the convergence detector's raw input (SPEC.md §4). */
export function meanSpeed(velocities: Float32Array, n: number): number {
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const vx = velocities[i * 2] ?? 0;
    const vy = velocities[i * 2 + 1] ?? 0;
    sum += Math.sqrt(vx * vx + vy * vy);
  }
  return n > 0 ? sum / n : 0;
}

/** Axis-aligned bounding-box diagonal of the current layout (SPEC.md §4's convergence threshold is relative to this, not an absolute constant). */
export function boundingBoxDiagonal(positions: Float32Array, n: number): number {
  if (n === 0) return 0;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < n; i++) {
    const x = positions[i * 2] ?? 0;
    const y = positions[i * 2 + 1] ?? 0;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  const dx = maxX - minX;
  const dy = maxY - minY;
  return Math.sqrt(dx * dx + dy * dy);
}

export function hasNonFiniteValue(arr: Float32Array): boolean {
  for (let i = 0; i < arr.length; i++) {
    const v = arr[i];
    if (v === undefined || !Number.isFinite(v)) return true;
  }
  return false;
}
