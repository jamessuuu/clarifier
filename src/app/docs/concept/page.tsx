import type { Metadata } from "next";

export const metadata: Metadata = { title: "Concept" };

export default function ConceptPage(): React.JSX.Element {
  return (
    <div className="mx-auto px-6 py-16">
      <div className="docs-prose">
        <h1>Concept</h1>
        <p>
          A conventional chart requires choosing one or two axes before you look. With more than two informative numeric columns, the joint
          structure across all of them is invisible to any single chart unless you already know which two columns matter — which is usually the
          thing you are trying to find out.
        </p>
        <p>
          A force-settled layout is a physically legible multivariate embedding: every mapped column contributes a force simultaneously, and the
          settled position of a point is jointly determined by all of them at once, not by two chosen axes.
        </p>

        <h2>The mechanism</h2>
        <img
          src="/diagram/mechanism.svg"
          alt="Diagram: numeric high-variance column maps to mass and pulls toward the composition center; categorical column maps to charge and repels/attracts by group; second numeric column maps to attraction and pulls similar rows together; a binned column maps to viscosity and damps velocity, reading as sluggish subgroups. The visible effect — clusters, separation, or interpenetration — is the finding."
          width={880}
          height={420}
          className="mt-4 w-full max-w-3xl rounded-[2px] border border-rule"
        />

        <h2>What this earns that a bar chart or scatter plot cannot</h2>
        <ul>
          <li>
            <strong>Clusters across more than two columns</strong> — points that agree on several attraction-mapped columns converge physically,
            even when no single pair of columns would separate them in a 2D scatter.
          </li>
          <li>
            <strong>Outliers as a physical fact</strong> — a point far from everything on the mapped dimensions fails to find a stable position
            near any cluster and visibly ends up at the periphery, distinct from a boxplot&apos;s single-column-at-a-time test.
          </li>
          <li>
            <strong>Whether two columns actually correlate</strong> — map one to attraction and another to spring stiffness; a layout that settles
            calmly says they pull together, one that stays jittery says they don&apos;t.
          </li>
          <li>
            <strong>Group separation as a real test</strong> — a categorical column mapped to charge sign physically repels its groups apart if
            the other mapped columns actually support that separation. Interpenetration is a finding, not a rendering failure.
          </li>
        </ul>

        <h2>How the claim is measured, not asserted</h2>
        <p>
          Every session computes a <strong>separation-gain</strong> number: the best-achievable 2-axis view (silhouette score of a k-means
          assignment on the top-2 PCA components of the mapped numeric columns) versus the same silhouette score computed on the final settled
          physics positions, at the same <code>k</code>. k-means here is an internal scoring tool only — it never drives the rendered layout.
        </p>
        <ul>
          <li>
            <code>physicsSilhouette − pca2dSilhouette ≤ 0.05</code> → <em>&ldquo;No meaningful gain over a 2-axis view&rdquo;</em> — a scatter plot
            would show you the same thing. Both raw numbers are always shown, win or lose.
          </li>
          <li>
            <code>&gt; 0.05</code> → <em>&ldquo;Physics separates this data better than the best 2-axis view&rdquo;</em> — these columns are doing
            joint work no single scatter plot shows.
          </li>
        </ul>
        <p>
          This is a mechanism, not a promise: the CI eval suite (<code>evals/</code>) asserts a real clustered dataset scores &ldquo;stronger&rdquo;
          and a genuinely random one scores &ldquo;no meaningful gain,&rdquo; so a change that quietly breaks the claim fails CI before it ships a
          page whose central sentence is no longer true.
        </p>
      </div>
    </div>
  );
}
