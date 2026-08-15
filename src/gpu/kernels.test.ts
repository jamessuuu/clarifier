// wgsl_reflect@1.5.0 has no "exports" map and its "main" (wgsl_reflect.node.js)
// declares itself with `exports.X = ...` while the package's own
// "type": "module" makes Node treat that file as ESM, throwing
// "exports is not defined" the moment plain `from "wgsl_reflect"` resolves
// to it. Importing the real ESM build directly (wgsl_reflect.module.js,
// which the package.json "module" field points at but Node's own resolver
// does not honor) sidesteps the bug without patching the dependency.
import { WgslReflect } from "wgsl_reflect/wgsl_reflect.module.js";
import { describe, expect, it } from "vitest";

import { ACCEL_GRID_WGSL, CELL_INDEX_WGSL, GRID_CELL_COUNT, GRID_DIM, SCATTER_WGSL } from "./kernels-grid";
import { ACCEL_NAIVE_WGSL, INTEGRATE_WGSL, RENDER_WGSL } from "./kernels";

/**
 * SPEC.md §13: GitHub Actions runners have no GPU, so the WGSL path is
 * never run in CI — a real-device pass is a build-time, not CI-time, check.
 * This is the one WGSL check CI actually CAN run: real syntax parsing via
 * wgsl_reflect (a WGSL parser with no GPU dependency), which catches typos,
 * mismatched braces, and structural errors before a visitor's browser
 * would. The real-device pass itself DID happen during this build
 * (docs/limitations has the full account: both the naive and spatial-grid
 * paths were exercised live against a real WebGPU adapter, settling real
 * datasets with zero console errors) — just not as part of this
 * CI-runnable suite, consistent with SPEC.md's own framing of that as a
 * separate, build-time check.
 */
function assertParses(name: string, source: string): void {
  expect(() => new WgslReflect(source), `${name} failed to parse`).not.toThrow();
}

describe("WGSL kernels parse as valid WGSL (wgsl_reflect)", () => {
  it("ACCEL_NAIVE_WGSL", () => assertParses("ACCEL_NAIVE_WGSL", ACCEL_NAIVE_WGSL));
  it("INTEGRATE_WGSL", () => assertParses("INTEGRATE_WGSL", INTEGRATE_WGSL));
  it("RENDER_WGSL", () => assertParses("RENDER_WGSL", RENDER_WGSL));
  it("CELL_INDEX_WGSL", () => assertParses("CELL_INDEX_WGSL", CELL_INDEX_WGSL));
  it("SCATTER_WGSL", () => assertParses("SCATTER_WGSL", SCATTER_WGSL));
  it("ACCEL_GRID_WGSL", () => assertParses("ACCEL_GRID_WGSL", ACCEL_GRID_WGSL));
});

describe("WGSL kernels declare the expected entry points and bindings", () => {
  it("ACCEL_NAIVE_WGSL has a compute entry point named main with 6 bindings", () => {
    const r = new WgslReflect(ACCEL_NAIVE_WGSL);
    expect(r.functions.some((f) => f.name === "main")).toBe(true);
    expect(r.storage.length + r.uniforms.length).toBe(6);
  });

  it("RENDER_WGSL declares both a vertex and a fragment entry point", () => {
    const r = new WgslReflect(RENDER_WGSL);
    const names = r.functions.map((f) => f.name);
    expect(names).toContain("vs_main");
    expect(names).toContain("fs_main");
  });

  it("ACCEL_GRID_WGSL binds all 9 buffers the pipeline must provide", () => {
    const r = new WgslReflect(ACCEL_GRID_WGSL);
    expect(r.storage.length + r.uniforms.length).toBe(9);
  });
});

describe("grid constants", () => {
  it("GRID_DIM squared equals GRID_CELL_COUNT", () => {
    expect(GRID_DIM * GRID_DIM).toBe(GRID_CELL_COUNT);
  });
  it("GRID_DIM is a sane, positive, finite grid size", () => {
    expect(GRID_DIM).toBeGreaterThan(0);
    expect(Number.isFinite(GRID_DIM)).toBe(true);
  });
});
