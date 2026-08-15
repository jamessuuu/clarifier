import { describe, expect, it } from "vitest";

import { resolveRung, RUNG_BUDGETS } from "./rungs";

describe("resolveRung — SPEC.md §6 fallback ladder", () => {
  it("prefers-reduced-motion forces static regardless of capability", () => {
    expect(resolveRung({ webgpu: true, webgl2: true, reducedMotion: true })).toBe("static");
  });

  it("prefers webgpu when available and motion is not reduced", () => {
    expect(resolveRung({ webgpu: true, webgl2: true, reducedMotion: false })).toBe("webgpu");
  });

  it("falls to webgl2 when webgpu is unavailable", () => {
    expect(resolveRung({ webgpu: false, webgl2: true, reducedMotion: false })).toBe("webgl2");
  });

  it("falls to static when neither webgpu nor webgl2 is available", () => {
    expect(resolveRung({ webgpu: false, webgl2: false, reducedMotion: false })).toBe("static");
  });

  it("falls to webgl2 when webgpu hardware is present but the compute path isn't implemented yet (M3 -> M4 boundary)", () => {
    expect(resolveRung({ webgpu: true, webgl2: true, reducedMotion: false }, { webgpuImplemented: false })).toBe("webgl2");
  });
});

describe("RUNG_BUDGETS", () => {
  it("webgpu has the largest budget, static the smallest", () => {
    expect(RUNG_BUDGETS.webgpu).toBeGreaterThan(RUNG_BUDGETS.webgl2);
    expect(RUNG_BUDGETS.webgl2).toBeGreaterThanOrEqual(RUNG_BUDGETS.static);
  });
});
