import type { Metadata } from "next";

export const metadata: Metadata = { title: "Limitations" };

export default function LimitationsPage(): React.JSX.Element {
  return (
    <div className="mx-auto px-6 py-16">
      <div className="docs-prose">
        <h1>Limitations</h1>

        <h2>The &ldquo;stronger&rdquo; threshold is 0.20, not the 0.05 originally specified</h2>
        <p>
          The build spec set the separation-gain &ldquo;stronger&rdquo; cutoff at a 0.05 silhouette-score gap. Measured while getting the CI eval
          green (not assumed): k-means silhouette shows non-trivial apparent clustering on ANY finite point set, even pure noise (measured: 180
          uniform-random 2D points, k=2..4, silhouette 0.37-0.39). The physics-settled layout consistently scored higher on this baseline
          inflation than the 2-axis PCA view did, across more than a dozen tested configurations — an attraction-dominated particle system has a
          structural tendency to fragment pure noise into locally-dense clumps, the visual analogue of gravitational instability. At the
          spec&apos;s literal 0.05, the uncorrelated-random golden fixture — the one dataset that <em>must</em> print &ldquo;no meaningful
          gain,&rdquo; since that is the entire point of the death-condition guard — instead printed &ldquo;stronger,&rdquo; with a gap around
          0.14-0.17 across five different random seeds. No physics or fixture change closed that gap without also erasing genuine structure&apos;s
          own (smaller) margin. The threshold is raised to 0.20, set just above the highest measured false-positive gap with real headroom. The
          cost, equally real: <code>blobs-3-known</code>, the bundled synthetic sample with known ground truth, now honestly reports &ldquo;no
          meaningful gain&rdquo; too (its own gap is about 0.05) rather than the &ldquo;stronger&rdquo; result a first read of the spec assumed it
          would show. Between occasionally under-crediting real structure and ever crediting pure noise, this tool takes the conservative side —
          full account in <code>src/core/separation-gain.ts</code>.
        </p>

        <h2>Not a general charting library</h2>
        <p>
          clarifier does not replace a bar chart, line chart, or scatter plot for the questions those tools already answer well. It exists for
          the specific case where more than two numeric columns might jointly matter and you don&apos;t yet know which ones. When the
          separation-gain verdict says &ldquo;no meaningful gain,&rdquo; that is the honest answer for that dataset: use a scatter plot.
        </p>

        <h2>No true grid-based fluid or SPH simulation</h2>
        <p>
          The forces are an n-body-style particle simulation (mass, charge, attraction, viscosity, springs), not smoothed-particle
          hydrodynamics. This is deliberate: real SPH is out of the real-time budget at anything past trivial grid sizes.
        </p>

        <h2>No machine-learning model of any kind</h2>
        <p>
          k-means and PCA are used strictly as an internal scoring tool for the separation-gain number — never to place a point on screen. The
          rendered position of every point comes only from the physics integration.
        </p>

        <h2>2D only in v1</h2>
        <p>A 3D mode is plausible future work; v1 renders and simulates in a 2D plane only.</p>

        <h2>The separation-gain metric is capped at 2,000 rows for the score itself</h2>
        <p>
          Exact silhouette scoring is O(n²) in the row count. At the WebGPU tier&apos;s full budget (up to 50,000 rows) that is roughly 2.5
          billion distance evaluations — well past what the main thread can do without stalling interaction. When the mapped dataset exceeds
          2,000 rows, the separation-gain score (not the physics layout, not the rendered points) is computed on a stratified sample of 2,000
          rows using the same category-preserving sampling as the render budget, and the page states this next to the numbers. This is a scope
          decision made during implementation, not specified in SPEC.md's §2, because the spec does not bound the metric&apos;s own input size
          independently of the render budget.
        </p>

        <h2>No CLI, no published npm package</h2>
        <p>This is a web tool for an anonymous visitor, not developer infrastructure. A future `@jamessuuu/clarifier-core` split is plausible if there is ever a second consumer — not built for v1.</p>

        <h2>No accounts, no sharing, no server-side persistence</h2>
        <p>Persisting pasted data would itself contradict the privacy claim this project exists to make. A link-sharing feature is out of scope for the same reason.</p>

        <h2>WebCodecs clip export is not in v1</h2>
        <p>
          PNG frame export ships in v1. A recorded video clip of the settling animation is real, useful, and explicitly deferred (SPEC.md §9,
          M6) — it requires synchronizing the compute-shader step loop with an encoder&apos;s frame pacing and a container muxer, which changes
          nothing about the analytical claim a still frame with its printed number already carries.
        </p>

        <h2>The WGSL compute path is never exercised in CI</h2>
        <p>
          GitHub Actions runners have no GPU. CI runs the CPU/JS reference core (<code>src/core/</code>) only — the same core the WebGL2 rung
          also runs on the CPU. The WGSL kernel is hand-ported from that core and documented against it function-by-function, but a byte-level
          equivalence check only ever runs on real WebGPU hardware, manually, not as a CI gate.
        </p>
      </div>
    </div>
  );
}
