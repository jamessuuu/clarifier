import type { Metadata } from "next";

export const metadata: Metadata = { title: "Failure modes" };

const ROWS: Array<[string, string]> = [
  ["CSV fails to parse / not tabular (JSON, prose pasted)", "Structured error naming what was detected instead (“looks like JSON, not CSV”) — never a partial or garbage render."],
  ["Zero usable columns (all id-like / high-cardinality / all-null)", "Refuses gracefully: “no columns here map to a physical property,” with which columns were seen and why each was excluded. Never an empty canvas with no explanation."],
  ["1 row, or all rows identical on every mapped column", "Separation-gain marked insufficient-variance, with its own honest copy (“no variation in the data you mapped”) — distinct from a computed-and-low no-meaningful-gain verdict."],
  ["requestAdapter() returns null", "Caught; falls to the WebGL2 rung. Never an uncaught rejection."],
  [
    "WebGL2 context creation also fails",
    "Falls back to the same Canvas2D renderer the static rung uses — still animated in real time (not the static rung’s single settled frame, a minor difference from SPEC.md’s literal wording, caught and fixed during this build after a version that just showed a blank canvas here).",
  ],
  ["CSV larger than the resolved point budget", "Stratified sample down to budget, stated plainly next to the effect. Parsing itself runs on the main thread, not a Web Worker (SPEC.md's stated design, not yet built — measured at 50,000 rows, the app's own largest budget, this is a roughly 180ms pause, not a freeze; see Limitations for the real numbers at other sizes)."],
  [
    "Visitor drags a particle mid- or post-settle",
    "The physics-level mechanism (re-inject energy, resume stepping under the same convergence rule) is real and unit-tested (Simulation.perturb()); the pointer-drag UI wiring it to a mouse gesture is not built in v1 — SPEC.md itself frames this as an enhancement layered on top of the required keyboard-operable mapping panel, not a replacement for it, and that required path works today. See Limitations.",
  ],
  ["Simulation numerically diverges despite the stability clamps", "Hard NaN/Infinity guard every step; on detection, freeze at the last stable frame, log a console warning, show “simulation became unstable — showing the last stable frame.” Never renders NaN positions as a blank or garbage canvas."],
  ["Export requested before convergence", "Allowed; filename and metadata state the step count and “not yet settled.” Never presented as final silently."],
  ["prefers-reduced-motion toggled mid-session", "A live matchMedia listener switches to the static rung immediately, not only on next load."],
  ["Dataset exceeds the separation-gain sample cap (2,000 rows)", "The metric is computed on a stratified sample of up to 2,000 rows, same sampling rule as the render budget; stated on-page next to the numbers. Documented in Limitations — not in SPEC.md, added because exact silhouette is O(n²) and would stall the main thread on a 50,000-row dataset."],
];

export default function FailureModesPage(): React.JSX.Element {
  return (
    <div className="mx-auto px-6 py-16">
      <div className="docs-prose">
        <h1>Failure modes</h1>
        <p>Every situation clarifier is known to hit, and its exact contract. A situation not listed here that produces a blank canvas or a silent wrong answer is a bug — file it.</p>
        <table>
          <thead>
            <tr>
              <th>Situation</th>
              <th>Contract</th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map(([situation, contract]) => (
              <tr key={situation}>
                <td>{situation}</td>
                <td>{contract}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
