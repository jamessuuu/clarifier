"use client";

import { useEffect, useRef } from "react";

import type { Simulation } from "@/core/simulation";
import { drawFrame } from "@/static/renderer";

const MAX_STEPS_PER_FRAME = 8; // SPEC.md §4: accumulator clamped to avoid a spiral of death
const MAX_FRAME_DT = 0.25; // clamp a huge gap (tab backgrounded, debugger pause) to 250ms of catch-up

export interface SimulationCanvasProps {
  sim: Simulation;
  categoryOf?: (i: number) => number;
  outlierRowSet?: ReadonlySet<number>;
  /** SPEC.md §11: prefers-reduced-motion forces the static rung — this component still renders one frame but never runs the animation loop when true. */
  reducedMotion: boolean;
  onFrame?: (info: { step: number; converged: boolean; unstable: boolean }) => void;
  className?: string;
  "data-testid"?: string;
}

export function SimulationCanvas({ sim, categoryOf, outlierRowSet, reducedMotion, onFrame, className, ...rest }: SimulationCanvasProps): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = typeof window !== "undefined" ? (window.devicePixelRatio || 1) : 1;

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

    function draw(): void {
      if (!canvas || !ctx) return;
      drawFrame(ctx, {
        positions: sim.positions,
        n: sim.field.n,
        width: canvas.width,
        height: canvas.height,
        categoryOf,
        outlierRowSet,
      });
    }

    if (reducedMotion) {
      // Runs the same headless solve as the static rung, once, then draws a
      // single frame — never animates. 8000 steps (~133s of simulated time)
      // covers even a slow-converging shape (measured: an evenly-spaced
      // colinear attraction chain with no charge/mass differentiation can
      // take ~4500 steps); a realistic multi-cluster dataset settles in a
      // few hundred. If a pathological input still hasn't converged by then,
      // the last-computed frame is rendered as-is rather than blocking
      // indefinitely — a near-settled frame, not a crash.
      sim.runToConvergence(8000);
      draw();
      onFrame?.({ step: sim.step, converged: sim.converged, unstable: sim.unstable });
      return;
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
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `sim` identity change is the intended re-run trigger; categoryOf/outlierRowSet/onFrame read live via closure each frame is acceptable for a render loop.
  }, [sim, reducedMotion]);

  return <canvas ref={canvasRef} role="img" aria-hidden="true" className={className} {...rest} style={{ width: "100%", height: "100%", display: "block" }} />;
}
