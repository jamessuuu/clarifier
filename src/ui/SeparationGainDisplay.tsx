import type { SeparationGain } from "@/core/types";

export interface SeparationGainDisplayProps {
  gain: SeparationGain;
}

function fmt(n: number): string {
  return n.toFixed(2);
}

/**
 * SPEC.md §2: the page prints these two sentences VERBATIM depending on
 * verdict — this component is the one place that copy lives, so it can
 * never drift between the hero and any other surface that shows it.
 */
export function SeparationGainDisplay({ gain }: SeparationGainDisplayProps): React.JSX.Element {
  if (gain.verdict === "insufficient-variance") {
    return (
      <p className="text-sm" data-testid="separation-gain" data-verdict="insufficient-variance">
        No variation in the data you mapped — there&apos;s nothing here for either view to separate.
      </p>
    );
  }

  if (gain.verdict === "stronger") {
    return (
      <p className="text-sm" data-testid="separation-gain" data-verdict="stronger">
        Physics separates this data better than the best 2-axis view ({fmt(gain.physicsSilhouette)} vs {fmt(gain.pca2dSilhouette)}) — these columns are
        doing joint work no single scatter plot shows.
      </p>
    );
  }

  return (
    <p className="text-sm" data-testid="separation-gain" data-verdict="no-meaningful-gain">
      No meaningful gain over a 2-axis view (silhouette {fmt(gain.physicsSilhouette)} vs {fmt(gain.pca2dSilhouette)}) — a scatter plot would show you the
      same thing.
    </p>
  );
}
