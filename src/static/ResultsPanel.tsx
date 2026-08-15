import type { ResultsAnalysis } from "@/core/results-analysis";
import type { SeparationGain } from "@/core/types";

import { SeparationGainDisplay } from "@/ui/SeparationGainDisplay";

export interface ResultsPanelProps {
  analysis: ResultsAnalysis;
  gain: SeparationGain;
  rowLabels?: (i: number) => string;
}

function fmtRange(min: number, max: number): string {
  const round = (v: number): string => (Number.isInteger(v) ? String(v) : v.toFixed(2));
  return min === max ? round(min) : `${round(min)}–${round(max)}`;
}

/**
 * SPEC.md §11: "Alongside the canvas, a real HTML results panel — not
 * decorative alt text — states, generated from the same numbers the
 * physics view computes... A screen-reader visitor gets the actual finding,
 * not a description of a picture." Every number here comes from
 * core/results-analysis.ts's analyzeResults, run on the identical settled
 * positions the canvas draws — never a second, differently-computed
 * summary.
 */
export function ResultsPanel({ analysis, gain, rowLabels }: ResultsPanelProps): React.JSX.Element {
  return (
    <section aria-label="What the physics found" className="docs-prose text-sm">
      <h2 className="text-base">What this found</h2>
      <SeparationGainDisplay gain={gain} />

      {analysis.clusterCount > 0 && (
        <>
          <p>
            {analysis.clusterCount} cluster{analysis.clusterCount === 1 ? "" : "s"} found, largest first:
          </p>
          <ul>
            {analysis.clusters.map((c) => (
              <li key={c.index}>
                <strong>{c.size} rows</strong>
                {c.definingColumns.length > 0 && (
                  <>
                    {" "}
                    — defined by{" "}
                    {c.definingColumns.map((dc, i) => (
                      <span key={dc.name}>
                        {i > 0 ? ", " : ""}
                        <code>{dc.name}</code> {fmtRange(dc.min, dc.max)}
                      </span>
                    ))}
                  </>
                )}
              </li>
            ))}
          </ul>
        </>
      )}

      <p data-testid="outlier-summary">
        {analysis.outlierRowIndices.length === 0
          ? "No outliers — every row fits its cluster better than any other."
          : `${analysis.outlierRowIndices.length} outlier row${analysis.outlierRowIndices.length === 1 ? "" : "s"}: ${analysis.outlierRowIndices
              .slice(0, 20)
              .map((i) => (rowLabels ? rowLabels(i) : `row ${String(i + 1)}`))
              .join(", ")}${analysis.outlierRowIndices.length > 20 ? ", …" : ""}.`}
      </p>
    </section>
  );
}
