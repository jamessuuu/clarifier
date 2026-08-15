"use client";

import { SAMPLE_DATASETS } from "./sample-datasets";

export interface DatasetPickerProps {
  activeCsv: string;
  onSelect: (csv: string) => void;
}

/**
 * SPEC.md §10/§11: a real, focusable, labeled control per bundled sample —
 * never canvas-drawn, never a hidden dropdown that hides which dataset is
 * live. `activeCsv` is compared by value (not a separate id state) so the
 * picker always reflects what is ACTUALLY loaded, including the case where
 * a visitor has pasted their own CSV and none of the three are active.
 */
export function DatasetPicker({ activeCsv, onSelect }: DatasetPickerProps): React.JSX.Element {
  return (
    <div className="flex flex-col gap-2" data-testid="dataset-picker">
      <span className="text-sm font-medium" id="dataset-picker-label">
        Sample datasets
      </span>
      <div role="group" aria-labelledby="dataset-picker-label" className="flex flex-wrap gap-2">
        {SAMPLE_DATASETS.map((d) => {
          const active = d.csv === activeCsv;
          return (
            <button
              key={d.id}
              type="button"
              data-testid={`dataset-option-${d.id}`}
              aria-pressed={active}
              onClick={() => onSelect(d.csv)}
              title={d.description}
              className={`rounded-[2px] border px-3 py-1.5 text-left text-xs ${
                active ? "border-ink bg-ink text-paper" : "border-rule bg-paper text-ink hover:border-ink/50"
              }`}
            >
              {d.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
