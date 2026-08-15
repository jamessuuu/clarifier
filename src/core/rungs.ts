import type { Rung } from "./types";

/**
 * SPEC.md §5 point budgets. Tier A/B within WebGPU are not independently
 * re-measured for clarifier (SPEC.md §16 open question 4 — inherited from
 * creative-tech §5.5, explicitly deferred to a real-device pass); this ships
 * a single WebGPU budget at the Tier A ceiling rather than guessing a tier
 * split with no measurement behind it.
 *
 * WebGL2's budget is pinned to the CONSERVATIVE END of §5's stated
 * 2,000-5,000 range, and here is the real measurement behind that choice,
 * not an assumption: the naive O(n^2) CPU force calc (src/core/physics.ts,
 * unmodified — same algorithm every rung uses) was benchmarked directly
 * (scripts/_perf.mjs, run then deleted — see the M3 commit message for the
 * full table). Force-calc-alone cost scales roughly quadratically: ~2ms at
 * 500 rows, ~8ms at 1,000, ~41ms at 2,000, ~87ms at 3,000, ~291ms at 5,000
 * (on this dev machine's Node/V8 — a real browser's V8 will differ, but not
 * by an order of magnitude). Even at this rung's own 2,000-row floor, force
 * calc alone is already past a 16.7ms frame budget — this rung is real and
 * usable but genuinely NOT 60fps at its stated ceiling, unlike WebGPU's
 * explicit 60fps claim. 5,000 (the range's upper end) was measured well
 * past interactive and is not used.
 */
export const RUNG_BUDGETS: Record<Rung, number> = {
  webgpu: 50_000,
  webgl2: 2_000,
  static: 2_000,
};

export interface CapabilityFlags {
  webgpu: boolean;
  webgl2: boolean;
  reducedMotion: boolean;
}

/**
 * SPEC.md §6/§11: prefers-reduced-motion forces the static rung
 * independently of capability, checked first and re-checked live by the
 * caller (useReducedMotion's useSyncExternalStore), not just at load.
 *
 * `webgpuImplemented` exists purely to keep the M3 -> M4 build-order
 * boundary honest (SPEC.md §15): M3 ships real webgpu/webgl2 DETECTION, but
 * the actual WGSL compute/render path is M4's deliverable. Until M4 lands,
 * this stays false so a webgpu-capable visitor gets the (real, working)
 * WebGL2 rung instead of a half-built one; M4 flips it to true.
 */
export function resolveRung(flags: CapabilityFlags, options: { webgpuImplemented: boolean } = { webgpuImplemented: true }): Rung {
  if (flags.reducedMotion) return "static";
  if (flags.webgpu && options.webgpuImplemented) return "webgpu";
  if (flags.webgl2) return "webgl2";
  return "static";
}
