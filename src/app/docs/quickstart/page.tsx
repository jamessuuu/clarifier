import type { Metadata } from "next";

export const metadata: Metadata = { title: "Quickstart" };

export default function QuickstartPage(): React.JSX.Element {
  return (
    <div className="mx-auto px-6 py-16">
      <div className="docs-prose">
        <h1>Quickstart</h1>
        <p>Five minutes, ending in a working result on your own data.</p>

        <h2>1. Open the tool</h2>
        <p>
          Go to <code>/</code>. It loads directly into a real sample dataset, already mid-settle — you never start from an empty box. Watch it
          settle (a few seconds), then read the printed <strong>separation-gain</strong> line: it states, with two real numbers, whether the
          physics layout found structure a 2-axis scatter plot would have missed.
        </p>

        <h2>2. Paste your own CSV</h2>
        <p>Click &ldquo;Paste your own CSV&rdquo; and paste tabular data with a header row. clarifier infers each column&apos;s type:</p>
        <ul>
          <li>
            <strong>numeric</strong> — more than 90% of non-null values parse as a float
          </li>
          <li>
            <strong>categorical</strong> — few distinct values relative to row count (≤12 distinct, and distinct/rows &lt; 0.5)
          </li>
          <li>
            <strong>id-like</strong> — distinct/rows ≥ 0.9; excluded from every force, offered only as a row label
          </li>
        </ul>

        <h2>3. Check the mapping</h2>
        <p>
          The mapping panel shows which column drives which force — mass, charge, attraction, viscosity — with an auto-inferred default you can
          override from a real, labeled dropdown for every column. Nothing is canvas-drawn; every control is keyboard reachable.
        </p>

        <h2>4. Read the capability line</h2>
        <p>
          A line under the canvas states plainly which rung is running: WebGPU compute, WebGL2 with simplified physics, or the static CPU
          fallback. If your row count exceeds the resolved budget for that rung, it says exactly how many of how many rows are shown.
        </p>

        <h2>5. Read the finding, not just the picture</h2>
        <p>
          Below the canvas, a real HTML results panel states the cluster count, the defining columns of the largest clusters, the outlier rows,
          and the same separation-gain numbers as the headline claim — generated from the same computation the physics view used, readable
          without the canvas at all.
        </p>

        <h2>6. Export</h2>
        <p>
          The export button writes a PNG of the current frame. Its filename carries the run&apos;s seed, mapping, and step count, so the exact
          frame is reproducible from the same input.
        </p>

        <h2>The exact command to run it locally</h2>
        <pre>
          <code>{`git clone https://github.com/jamessuuu/clarifier.git
cd clarifier
pnpm install
pnpm build && node scripts/serve-out.mjs
# open http://localhost:4173`}</code>
        </pre>
      </div>
    </div>
  );
}
