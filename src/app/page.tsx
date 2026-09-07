import { SimulationHost } from "@/ui/SimulationHost";

/**
 * The plot is the first screen. This route used to open with a small heading
 * and three lines of prose explaining force-settling, above a large empty
 * white square. The explanation is now one line plus three chips, and the
 * instrument starts settling immediately below it.
 */
export default function HomePage(): React.JSX.Element {
  return (
    <div className="ambient">
      <div className="mx-auto max-w-6xl px-5 pb-16 pt-10 sm:px-6 sm:pt-14">
        <div className="rise">
          <p className="t-kicker">CSV in, physics out, nothing leaves this tab</p>
          <h1 className="t-display mt-3">clarifier</h1>
          <p className="t-lede mt-4 max-w-2xl">
            Paste a CSV. Columns map to physical properties, not axes, and force-settling separates
            commingled rows into legible clusters.
          </p>
          <ul className="mt-5 flex flex-wrap gap-2">
            <li>
              <span className="chip">
                <b>rank</b> normalization by default
              </span>
            </li>
            <li>
              <a className="chip" href="/docs/concept">
                how the physics works
              </a>
            </li>
            <li>
              <a className="chip" href="/docs/limitations">
                where it says no
              </a>
            </li>
          </ul>
        </div>
        <div className="mt-8 rise rise-2">
          <SimulationHost />
        </div>
      </div>
    </div>
  );
}
