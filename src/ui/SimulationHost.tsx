"use client";

import { useState } from "react";

import type { Simulation } from "@/core/simulation";
import { generateBlobs3Known, toCsv } from "@/core/synthetic";

import { SimulationCanvas } from "./SimulationCanvas";
import { useReducedMotion } from "./useReducedMotion";
import { useDataset } from "./useSimulation";

const DEFAULT_SEED = 1;
const bundledBlobs = generateBlobs3Known(DEFAULT_SEED);
const DEFAULT_CSV = toCsv(bundledBlobs.rows);

interface FrameInfo {
  step: number;
  converged: boolean;
  unstable: boolean;
}

/**
 * Owns its own frame-info state, freshly initialized on mount — the parent
 * remounts this (via `key={csvText}`) instead of resetting state in an
 * effect when a new dataset loads (React's own recommended pattern for
 * "reset all state when an input changes").
 */
function RunningSimulation({ sim, reducedMotion }: { sim: Simulation; reducedMotion: boolean }): React.JSX.Element {
  const [frameInfo, setFrameInfo] = useState<FrameInfo>({ step: 0, converged: false, unstable: false });

  return (
    <>
      <div className="aspect-square w-full overflow-hidden rounded-[2px] border border-rule bg-paper" data-testid="canvas-wrap">
        <SimulationCanvas sim={sim} reducedMotion={reducedMotion} onFrame={setFrameInfo} data-testid="sim-canvas" />
      </div>
      <div className="mt-3 font-house-mono text-xs text-ink/70" data-testid="status-line" aria-live="polite">
        {frameInfo.unstable ? (
          <span className="text-amber">simulation became unstable — showing the last stable frame</span>
        ) : frameInfo.converged ? (
          <span>
            Settled after {(frameInfo.step / 60).toFixed(1)}s, {frameInfo.step} steps
          </span>
        ) : (
          <span>Settling… step {frameInfo.step}</span>
        )}
      </div>
    </>
  );
}

export function SimulationHost(): React.JSX.Element {
  const [csvText, setCsvText] = useState(DEFAULT_CSV);
  const [draftText, setDraftText] = useState(DEFAULT_CSV);
  const reducedMotion = useReducedMotion();

  const outcome = useDataset(csvText, DEFAULT_SEED);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div>
        {outcome.status === "ready" ? (
          <RunningSimulation key={csvText} sim={outcome.sim} reducedMotion={reducedMotion} />
        ) : (
          <div className="flex aspect-square w-full items-center justify-center rounded-[2px] border border-rule bg-paper p-8 text-center text-sm text-ink/70" data-testid="dataset-message">
            {outcome.status === "empty" && "Paste a CSV with a header row to begin."}
            {outcome.status === "parse-error" && outcome.message}
            {outcome.status === "zero-usable-columns" && "No columns here map to a physical property."}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-4">
        {outcome.status === "zero-usable-columns" && (
          <ul className="text-xs text-ink/70" data-testid="excluded-columns">
            {outcome.seenColumns.map((c) => (
              <li key={c.name}>
                <code>{c.name}</code>: {c.reason}
              </li>
            ))}
          </ul>
        )}

        <label htmlFor="csv-input" className="text-sm font-medium">
          Paste your own CSV
        </label>
        <textarea
          id="csv-input"
          data-testid="csv-textarea"
          className="h-40 w-full rounded-[2px] border border-rule bg-paper p-2 font-house-mono text-xs"
          value={draftText}
          onChange={(e) => setDraftText(e.target.value)}
          spellCheck={false}
        />
        <button
          type="button"
          data-testid="run-button"
          onClick={() => setCsvText(draftText)}
          className="rounded-[2px] border border-ink bg-ink px-4 py-2 text-sm text-paper hover:bg-ink/85"
        >
          Run
        </button>
        <p className="text-xs text-ink/60">This is a real dataset (synthetic, seed-generated, 3 known clusters) — paste your own any time.</p>
      </div>
    </div>
  );
}
