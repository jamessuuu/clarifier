"use client";

import { useMemo, useState } from "react";

import type { Simulation } from "@/core/simulation";
import { generateBlobs3Known, toCsv } from "@/core/synthetic";
import type { ColumnMapping, SeparationGain } from "@/core/types";
import type { ColumnStats } from "@/csv/infer";
import type { ParsedTable } from "@/csv/parse";

import { MappingPanel } from "./MappingPanel";
import { SeparationGainDisplay } from "./SeparationGainDisplay";
import { SimulationCanvas } from "./SimulationCanvas";
import { buildSimulation, computeSeparationGainForSim, useParsedDataset } from "./useSimulation";
import { useReducedMotion } from "./useReducedMotion";

const DEFAULT_SEED = 1;
const bundledBlobs = generateBlobs3Known(DEFAULT_SEED);
const DEFAULT_CSV = toCsv(bundledBlobs.rows);

interface FrameInfo {
  step: number;
  converged: boolean;
  unstable: boolean;
}

/**
 * Owns its own frame-info + separation-gain state, freshly initialized on
 * mount — the parent remounts this (via a `key` built from the mapping)
 * instead of resetting state in an effect (React's own recommended pattern
 * for "reset everything when an input changes"), which is also what keeps
 * this component free of the set-state-in-effect pattern entirely: gain is
 * only ever computed inside the onFrame event callback, never in an effect.
 */
function RunningSimulation({ sim, mappings, stats, seed, reducedMotion }: { sim: Simulation; mappings: ColumnMapping[]; stats: ColumnStats[]; seed: number; reducedMotion: boolean }): React.JSX.Element {
  const [frameInfo, setFrameInfo] = useState<FrameInfo>({ step: 0, converged: false, unstable: false });
  const [gain, setGain] = useState<SeparationGain | null>(null);

  function handleFrame(info: FrameInfo): void {
    setFrameInfo(info);
    if (info.converged && !gain) {
      setGain(computeSeparationGainForSim(sim, mappings, stats, seed));
    }
  }

  return (
    <>
      <div className="aspect-square w-full overflow-hidden rounded-[2px] border border-rule bg-paper" data-testid="canvas-wrap">
        <SimulationCanvas sim={sim} reducedMotion={reducedMotion} onFrame={handleFrame} data-testid="sim-canvas" />
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
      <div className="mt-4 min-h-[2.5rem]" aria-live="polite">
        {gain && <SeparationGainDisplay gain={gain} />}
      </div>
    </>
  );
}

function ReadyTool({ parsed, initialMappings, stats, reducedMotion }: { parsed: ParsedTable; initialMappings: ColumnMapping[]; stats: ColumnStats[]; reducedMotion: boolean }): React.JSX.Element {
  const [mappings, setMappings] = useState(initialMappings);
  const mappingKey = useMemo(() => mappings.map((m) => `${m.name}:${m.role}:${m.normalization}`).join("|"), [mappings]);
  const sim = useMemo(() => buildSimulation(parsed, mappings, stats, DEFAULT_SEED), [parsed, mappings, stats]);

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="min-w-0">
        <RunningSimulation key={mappingKey} sim={sim} mappings={mappings} stats={stats} seed={DEFAULT_SEED} reducedMotion={reducedMotion} />
      </div>
      <div className="flex min-w-0 flex-col gap-4">
        <h2 className="text-sm font-medium">Column mapping</h2>
        <MappingPanel mappings={mappings} stats={stats} onChange={setMappings} />
      </div>
    </div>
  );
}

export function SimulationHost(): React.JSX.Element {
  const [csvText, setCsvText] = useState(DEFAULT_CSV);
  const [draftText, setDraftText] = useState(DEFAULT_CSV);
  const reducedMotion = useReducedMotion();

  const outcome = useParsedDataset(csvText);

  return (
    <div className="flex min-w-0 flex-col gap-6">
      {outcome.status === "ready" ? (
        <ReadyTool key={csvText} parsed={outcome.parsed} initialMappings={outcome.mappings} stats={outcome.stats} reducedMotion={reducedMotion} />
      ) : (
        <div className="flex aspect-[21/9] w-full items-center justify-center rounded-[2px] border border-rule bg-paper p-8 text-center text-sm text-ink/70" data-testid="dataset-message">
          {outcome.status === "empty" && "Paste a CSV with a header row to begin."}
          {outcome.status === "parse-error" && outcome.message}
          {outcome.status === "zero-usable-columns" && "No columns here map to a physical property."}
        </div>
      )}

      {outcome.status === "zero-usable-columns" && (
        <ul className="text-xs text-ink/70" data-testid="excluded-columns">
          {outcome.seenColumns.map((c) => (
            <li key={c.name}>
              <code>{c.name}</code>: {c.reason}
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-col gap-2">
        <label htmlFor="csv-input" className="text-sm font-medium">
          Paste your own CSV
        </label>
        <textarea
          id="csv-input"
          data-testid="csv-textarea"
          className="h-32 w-full rounded-[2px] border border-rule bg-paper p-2 font-house-mono text-xs"
          value={draftText}
          onChange={(e) => setDraftText(e.target.value)}
          spellCheck={false}
        />
        <div>
          <button
            type="button"
            data-testid="run-button"
            onClick={() => setCsvText(draftText)}
            className="rounded-[2px] border border-ink bg-ink px-4 py-2 text-sm text-paper hover:bg-ink/85"
          >
            Run
          </button>
        </div>
        <p className="text-xs text-ink/60">This is a real dataset (synthetic, seed-generated, 3 known clusters) — paste your own any time.</p>
      </div>
    </div>
  );
}
