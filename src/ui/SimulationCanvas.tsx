"use client";

import { useEffect, useRef } from "react";

import type { Rung } from "@/core/types";
import type { Simulation } from "@/core/simulation";
import { createGLRenderer, type GLRenderer } from "@/gl/renderer";
import { drawFrame } from "@/static/renderer";

const MAX_STEPS_PER_FRAME = 8; // SPEC.md §4: accumulator clamped to avoid a spiral of death
const MAX_FRAME_DT = 0.25; // clamp a huge gap (tab backgrounded, debugger pause) to 250ms of catch-up
const STATIC_MAX_STEPS = 8000; // see SimulationCanvas's static-rung comment below for the measurement behind this

export interface SimulationCanvasProps {
  sim: Simulation;
  /** The already-resolved rung (SPEC.md §6) — this component renders it, it does not detect capability itself. */
  rung: Rung;
  categoryOf?: (i: number) => number;
  outlierRowSet?: ReadonlySet<number>;
  onFrame?: (info: { step: number; converged: boolean; unstable: boolean }) => void;
  className?: string;
  "data-testid"?: string;
}

export function SimulationCanvas({ sim, rung, categoryOf, outlierRowSet, onFrame, className, ...rest }: SimulationCanvasProps): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;

    function resize(): void {
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const w = Math.max(1, Math.round(rect.width * dpr));
      const h = Math.max(1, Math.round(rect.height * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
    }
    resize();

    if (rung === "static") {
      // SPEC.md §6.3: runs the same CPU/JS algorithm to convergence once,
      // headless (no per-frame render during the solve), then renders a
      // SINGLE frame of the real converged output. Also what
      // prefers-reduced-motion resolves to (SPEC.md §11), via the caller's
      // rung selection, not a separate code path here.
      //
      // 8000 steps (~133s of simulated time) covers even a slow-converging
      // shape (measured: an evenly-spaced colinear attraction chain with no
      // charge/mass differentiation can take ~4500 steps); a realistic
      // multi-cluster dataset settles in a few hundred. If a pathological
      // input still hasn't converged by then, the last-computed frame is
      // rendered as-is rather than blocking indefinitely — a near-settled
      // frame, not a crash.
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      sim.runToConvergence(STATIC_MAX_STEPS);
      drawFrame(ctx, { positions: sim.positions, n: sim.field.n, width: canvas.width, height: canvas.height, categoryOf, outlierRowSet });
      onFrame?.({ step: sim.step, converged: sim.converged, unstable: sim.unstable });
      return;
    }

    let glRenderer: GLRenderer | null = null;
    let ctx2d: CanvasRenderingContext2D | null = null;
    if (rung === "webgl2") {
      glRenderer = createGLRenderer(canvas);
      if (!glRenderer) return; // detection said webgl2 was available; a real creation failure here is a genuine SPEC.md §12 case, not expected in practice
    } else {
      ctx2d = canvas.getContext("2d");
      if (!ctx2d) return;
    }

    function draw(): void {
      if (!canvas) return;
      if (glRenderer) {
        glRenderer.render(sim.positions, sim.field.n);
      } else if (ctx2d) {
        drawFrame(ctx2d, { positions: sim.positions, n: sim.field.n, width: canvas.width, height: canvas.height, categoryOf, outlierRowSet });
      }
    }

    let raf = 0;
    let last = performance.now();
    let acc = 0;
    let cancelled = false;

    function tick(now: number): void {
      if (cancelled) return;
      const frameDt = Math.min((now - last) / 1000, MAX_FRAME_DT);
      last = now;
      acc += frameDt;
      let steps = 0;
      while (acc >= sim.dt && steps < MAX_STEPS_PER_FRAME) {
        sim.advance();
        acc -= sim.dt;
        steps++;
      }
      if (steps >= MAX_STEPS_PER_FRAME) acc = 0; // spiral-of-death guard: drop the backlog instead of ever-longer catch-up bursts
      resize();
      draw();
      onFrame?.({ step: sim.step, converged: sim.converged, unstable: sim.unstable });
      raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      glRenderer?.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `sim`/`rung` identity change is the intended re-run trigger; categoryOf/outlierRowSet/onFrame read live via closure each frame is acceptable for a render loop.
  }, [sim, rung]);

  return <canvas ref={canvasRef} role="img" aria-hidden="true" className={className} {...rest} style={{ width: "100%", height: "100%", display: "block" }} />;
}
