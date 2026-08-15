/**
 * SPEC.md §7: "WGSL kernels mirroring core/'s semantics." Hand-ported from
 * src/core/physics.ts function-by-function (documented per-block below) —
 * GitHub Actions runners have no GPU, so this can never be executed in CI
 * (SPEC.md §13, a stated constraint). It DOES run on real WebGPU hardware:
 * this build sandbox's own adapter was null early in the build (M0's probe)
 * but resolved to a real adapter+device later in the same session — this
 * naive path was exercised live (Playwright against the running dev
 * server), settling a real dataset with zero console errors and a
 * genuinely different (independently-computed, not reused-from-CPU)
 * separation-gain result. Syntax additionally checked in CI via
 * src/gpu/kernels.test.ts (wgsl_reflect, no GPU required). Two dispatches
 * per step, exactly mirroring core/physics.ts's two-function split
 * (computeAccelerations, then integrate) — accel is a separate pass
 * specifically so every thread reads only "old" positions and never a
 * value another thread already updated this step.
 */

export const ACCEL_NAIVE_WGSL = /* wgsl */ `
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

// Mirrors core/physics.ts's computeAccelerations: centering (weak linear
// spring to the origin), attraction (Hookean spring toward a
// dissimilarity-scaled rest length), charge (same-category attracts,
// different-category repels, 1/(r^2+eps) falloff), collision (short-range
// fixed repulsion). Every pairwise term divided by the RECEIVING particle's
// own mass (F = ma => a = F/m), matching the CPU reference exactly.
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

  for (var j: u32 = 0u; j < params.n; j = j + 1u) {
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

  accel[i] = acc;
}
`;

export const INTEGRATE_WGSL = /* wgsl */ `
struct Params {
  n: u32,
  dt: f32,
  viscosityBase: f32,
  viscosityScale: f32,
  maxSpeed: f32,
}

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var<storage, read_write> positions: array<vec2<f32>>;
@group(0) @binding(2) var<storage, read_write> velocities: array<vec2<f32>>;
@group(0) @binding(3) var<storage, read> accel: array<vec2<f32>>;
@group(0) @binding(4) var<storage, read> viscosity: array<f32>;

// Mirrors core/physics.ts's integrate: semi-implicit (symplectic) Euler —
// velocity updates from acceleration FIRST, then position updates from the
// NEW velocity — per-particle viscosity damping, then the hard velocity
// clamp (SPEC.md §4: "no single force spike ejects a particle to infinity").
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let i = gid.x;
  if (i >= params.n) {
    return;
  }

  var v = velocities[i] + accel[i] * params.dt;
  let damp = 1.0 - min(0.98, params.viscosityBase + viscosity[i] * params.viscosityScale);
  v = v * damp;

  let speed = length(v);
  if (speed > params.maxSpeed) {
    v = v * (params.maxSpeed / speed);
  }

  velocities[i] = v;
  positions[i] = positions[i] + v * params.dt;
}
`;

export const RENDER_WGSL = /* wgsl */ `
struct Uniforms {
  scale: vec2<f32>,
  offset: vec2<f32>,
  resolution: vec2<f32>,
  pointSize: f32,
  _pad: f32,
  color: vec4<f32>,
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var<storage, read> positions: array<vec2<f32>>;

struct VertexOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) quadPos: vec2<f32>,
}

const QUAD = array<vec2<f32>, 6>(
  vec2<f32>(-0.5, -0.5), vec2<f32>(0.5, -0.5), vec2<f32>(-0.5, 0.5),
  vec2<f32>(-0.5, 0.5), vec2<f32>(0.5, -0.5), vec2<f32>(0.5, 0.5)
);

@vertex
fn vs_main(@builtin(vertex_index) vertexIndex: u32, @builtin(instance_index) instanceIndex: u32) -> VertexOutput {
  let quad = QUAD[vertexIndex];
  let instancePos = positions[instanceIndex];
  let screenPos = instancePos * uniforms.scale + uniforms.offset + quad * uniforms.pointSize * 2.0;
  let clip = (screenPos / uniforms.resolution) * 2.0 - 1.0;
  var out: VertexOutput;
  out.position = vec4<f32>(clip.x, -clip.y, 0.0, 1.0);
  out.quadPos = quad;
  return out;
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
  let d = length(in.quadPos);
  if (d > 0.5) {
    discard;
  }
  let alpha = smoothstep(0.5, 0.42, d);
  return vec4<f32>(uniforms.color.rgb, alpha * 0.9);
}
`;
