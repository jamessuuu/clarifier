import type { Rung } from "@/core/types";
import type { SampleInfo } from "./useSimulation";

export interface CapabilityLineProps {
  rung: Rung;
  detecting: boolean;
  sampleInfo: SampleInfo;
}

function fmt(n: number): string {
  return n.toLocaleString("en-US");
}

/**
 * SPEC.md §6: the capability line states, verbatim in spirit, which rung is
 * running and — SPEC.md §5 — the exact sampled-row count "plainly next to
 * the effect," never a silent truncation.
 */
export function CapabilityLine({ rung, detecting, sampleInfo }: CapabilityLineProps): React.JSX.Element {
  if (detecting) {
    return (
      <p className="font-house-mono text-xs text-ink/60" data-testid="capability-line">
        Checking device capability…
      </p>
    );
  }

  let text: string;
  if (rung === "webgpu") {
    text = `Running on WebGPU — showing ${fmt(sampleInfo.shown)} of ${fmt(sampleInfo.total)} rows.`;
  } else if (rung === "webgl2") {
    text = `Running on WebGL2 — showing ${fmt(sampleInfo.shown)} of ${fmt(sampleInfo.total)} rows, simplified physics.`;
  } else {
    // Static's headless solve always runs on the FULL mapped dataset (no
    // per-frame render cost to offset, SPEC.md §5's own budget table), so
    // the only sampling that can apply here is the static rung's own
    // 2,000-row point budget — stated the same way as the other rungs when it fires.
    text = sampleInfo.sampled ? `Running the CPU fallback, same result, static — showing ${fmt(sampleInfo.shown)} of ${fmt(sampleInfo.total)} rows, stratified sample.` : "Running the CPU fallback, same result, static.";
  }

  return (
    <p className="font-house-mono text-xs text-ink/60" data-testid="capability-line" data-rung={rung}>
      {text}
    </p>
  );
}
