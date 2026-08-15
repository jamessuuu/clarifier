/**
 * SPEC.md §5: "Above 5,000, switch to uniform spatial-grid binning:
 * particles are hashed into 2D grid cells each step, and force evaluation
 * only considers same/adjacent cells." Algorithmically the most complex
 * WGSL in the project (a 3-pass counting-sort spatial hash with atomics),
 * and cannot be exercised in CI (no GPU on GitHub Actions runners) — but IT
 * IS VERIFIED on real WebGPU hardware in this build sandbox: exercised live
 * (Playwright against the running dev server) at 6,000 rows (the smallest
 * n above this file's own 5,000-row threshold) and again at 20,000, both
 * settling to a real, visually-separated result with zero console errors
 * and row counts that summed correctly (no particle lost or duplicated by
 * the bucketing). Frame-time measurements from that same session are in
 * docs/limitations. Syntax additionally checked in CI (src/gpu/
 * kernels.test.ts, via wgsl_reflect).
 *
 * Three dispatches, run in this order every step, PLUS a JS-side buffer
 * readback + reupload between passes 1 and 2 (src/gpu/pipeline.ts):
 *   1. cellIndexPass — writes each particle's flat grid-cell index, and
 *      atomically counts how many particles land in each cell.
 *   2. (JS, not a kernel) exclusive prefix-sum over the cell counts ->
 *      per-cell start offsets. Done on the CPU deliberately: a correct
 *      parallel work-efficient scan is real GPU-algorithms work with its
 *      own failure modes, and this was a lower-risk implementation choice
 *      to write correctly than a pure-GPU scan sight-unseen. The CPU
 *      roundtrip trades some throughput for that — measured, not free:
 *      it's part of why the 20,000-row case (docs/limitations) is
 *      genuinely compute/roundtrip-bound rather than render-loop-capped.
 *   3. scatterPass — using atomics seeded from the uploaded offsets, writes
 *      each particle's index into its slot in a cell-sorted index buffer.
 *   4. accelGridPass — same pairwise force math as kernels.ts's naive pass,
 *      but each particle only visits the 3x3 neighborhood of grid cells via
 *      the sorted-index buffer, instead of every other particle.
 *
 * World extent is a fixed, generous bound rather than a dynamic per-frame
 * bounding-box reduction (SPEC.md §16 open question 2 explicitly defers
 * cell-size tuning to a real-device pass, not a spec-time constant) — the
 * centering spring keeps a converged layout within roughly a few multiples
 * of INITIAL_SPAWN_RADIUS (core/physics.ts) in practice.
 */

export const GRID_CELL_SIZE = 30; // ~= ATTRACTION_REST_SCALE (core/physics.ts), so 1-ring neighbor lookups cover most meaningful attraction range
export const GRID_WORLD_MIN = -150;
export const GRID_WORLD_MAX = 150;
export const GRID_DIM = Math.ceil((GRID_WORLD_MAX - GRID_WORLD_MIN) / GRID_CELL_SIZE); // cells per axis
export const GRID_CELL_COUNT = GRID_DIM * GRID_DIM;

const GRID_CONSTANTS_WGSL = /* wgsl */ `
const GRID_CELL_SIZE: f32 = ${GRID_CELL_SIZE.toFixed(1)};
const GRID_WORLD_MIN: f32 = ${GRID_WORLD_MIN.toFixed(1)};
const GRID_DIM: i32 = ${GRID_DIM};

fn cellCoord(p: vec2<f32>) -> vec2<i32> {
  let c = vec2<i32>(floor((p - vec2<f32>(GRID_WORLD_MIN, GRID_WORLD_MIN)) / GRID_CELL_SIZE));
  return clamp(c, vec2<i32>(0, 0), vec2<i32>(GRID_DIM - 1, GRID_DIM - 1));
}

fn cellFlatIndex(c: vec2<i32>) -> u32 {
  return u32(c.y * GRID_DIM + c.x);
}
`;

export const CELL_INDEX_WGSL = /* wgsl */ `
${GRID_CONSTANTS_WGSL}

struct Params {
  n: u32,
}

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var<storage, read> positions: array<vec2<f32>>;
@group(0) @binding(2) var<storage, read_write> cellIndexOut: array<u32>;
@group(0) @binding(3) var<storage, read_write> cellCount: array<atomic<u32>>;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let i = gid.x;
  if (i >= params.n) {
    return;
  }
  let cell = cellFlatIndex(cellCoord(positions[i]));
  cellIndexOut[i] = cell;
  atomicAdd(&cellCount[cell], 1u);
}
`;

export const SCATTER_WGSL = /* wgsl */ `
struct Params {
  n: u32,
}

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var<storage, read> cellIndexIn: array<u32>;
@group(0) @binding(2) var<storage, read_write> cellCursor: array<atomic<u32>>;
@group(0) @binding(3) var<storage, read_write> sortedIndices: array<u32>;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let i = gid.x;
  if (i >= params.n) {
    return;
  }
  let cell = cellIndexIn[i];
  let slot = atomicAdd(&cellCursor[cell], 1u);
  sortedIndices[slot] = i;
}
`;

export const ACCEL_GRID_WGSL = /* wgsl */ `
${GRID_CONSTANTS_WGSL}

struct Params {
  n: u32,
  attractionDims: u32,
  temperature: f32,
  centering: f32,
  attractionForce: f32,
  chargeForce: f32,
  collisionForce: f32,
  eps2: f32,
  collisionRadius: f32,
  attractionRestScale: f32,
}

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var<storage, read> positions: array<vec2<f32>>;
@group(0) @binding(2) var<storage, read> mass: array<f32>;
@group(0) @binding(3) var<storage, read> charge: array<f32>;
@group(0) @binding(4) var<storage, read> attraction: array<f32>;
@group(0) @binding(5) var<storage, read_write> accel: array<vec2<f32>>;
@group(0) @binding(6) var<storage, read> cellOffset: array<u32>;
@group(0) @binding(7) var<storage, read> cellCount: array<u32>;
@group(0) @binding(8) var<storage, read> sortedIndices: array<u32>;

// Same pairwise force math as kernels.ts's ACCEL_NAIVE_WGSL (kept in sync by
// hand — see that file's comment for the line-by-line core/physics.ts
// correspondence) — the only difference is the candidate set: the 3x3
// neighborhood of grid cells via the sorted-index buffer, instead of every
// other particle.
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let i = gid.x;
  if (i >= params.n) {
    return;
  }

  let pi = positions[i];
  let mi = mass[i];
  var acc = (-params.centering * pi) / mi;
  let dims = params.attractionDims;
  let myCell = cellCoord(pi);

  for (var dy: i32 = -1; dy <= 1; dy = dy + 1) {
    for (var dx: i32 = -1; dx <= 1; dx = dx + 1) {
      let nc = myCell + vec2<i32>(dx, dy);
      if (nc.x < 0 || nc.x >= GRID_DIM || nc.y < 0 || nc.y >= GRID_DIM) {
        continue;
      }
      let cell = cellFlatIndex(nc);
      let start = cellOffset[cell];
      let count = cellCount[cell];

      for (var s: u32 = 0u; s < count; s = s + 1u) {
        let j = sortedIndices[start + s];
        if (j == i) {
          continue;
        }
        let pj = positions[j];
        let mj = mass[j];
        let d = pi - pj;
        let r2 = dot(d, d);
        let r = max(sqrt(r2), 1e-6);
        let u = d / r;

        if (params.attractionForce != 0.0) {
          var sumsq: f32 = 0.0;
          for (var k: u32 = 0u; k < dims; k = k + 1u) {
            let ai = attraction[i * dims + k];
            let aj = attraction[j * dims + k];
            let diff = ai - aj;
            sumsq = sumsq + diff * diff;
          }
          var dissim: f32 = 0.0;
          if (dims > 0u) {
            dissim = sqrt(sumsq / f32(dims));
          }
          let restLength = dissim * params.attractionRestScale;
          let stretch = r - restLength;
          let fAttract = params.attractionForce * params.temperature * stretch;
          acc = acc - (u * fAttract) / mi;
        }

        if (params.chargeForce != 0.0) {
          let ci = charge[i];
          let cj = charge[j];
          let sameGroup = ci == cj;
          let diff = abs(ci - cj);
          var sign: f32 = 1.0;
          var magnitude: f32 = max(diff, 0.35);
          if (sameGroup) {
            sign = -1.0;
            magnitude = 0.15;
          }
          let fCharge = (sign * params.chargeForce * params.temperature * magnitude) / (r2 + params.eps2);
          acc = acc + (u * fCharge) / mi;
        }

        if (r < params.collisionRadius) {
          let overlap = (params.collisionRadius - r) / params.collisionRadius;
          let fCollision = params.collisionForce * overlap * overlap;
          acc = acc + (u * fCollision) / mi;
        }
      }
    }
  }

  accel[i] = acc;
}
`;
