# clarifier — SPEC

**Project:** P8 (physics-driven data visualization) · **Status:** proposed for build · **Date:** 2026-08-09
**Binds to:** PHASE-2.md, SELECTION-2.md (P8's definition and death condition: "pretty but no more
insightful than a bar chart"), research/phase2-creative-tech.md (§1 capability envelope, §2 weight
budgets, §3 lightest-technique-per-effect, §4 fallback ladder, §5.5 the GPU-compute swarm shape, §6
refusals), research/phase2-model-cards.md (P8: no model artifact, confirmed, not assumed),
research/phase2-market.md (concept 4 / ChartGPU: 670 HN points, developer library not end-user tool —
the gap this project fills), QUALITY-BAR.md, DESIGN-DIRECTION.md, BRAND-KIT.md.

**Name:** *clarifier* — the industrial vessel (water treatment, sugar refining, mineral processing)
that lets suspended matter separate under gravity into visible layers. The physical mechanism maps
directly onto the product's mechanism: force-settling separates commingled rows into legible clusters.
npm name confirmed unclaimed (E404, re-checked 2026-08-09); no GitHub collision in the
data-viz/physics-sim/dev-tool space. `fathom` was killed outright — an 8k-star privacy-analytics
project plus a well-known consumer AI notetaker share it.

## 1. Goal + non-goals

**Goal.** Paste or drop a CSV. Columns map to physical properties — mass, charge, attraction,
viscosity, springiness — not to axes. The data arranges itself under a real n-body-style simulation,
running entirely on the visitor's GPU, and the visitor can push it around. The product must earn an
analytical claim beyond decoration (§2) and must say plainly, with a computed number, when it hasn't.
Zero server compute at any traffic; nothing the visitor pastes ever leaves their device.

**Non-goals.** Not a general charting library — ChartGPU already owns that lane as a developer tool;
clarifier is the end-user tool nobody has shipped (phase2-market.md concept 4). No true grid-based
fluid/SPH simulation — out of the real-time budget except at trivial grid sizes (creative-tech §1). No
ML model of any kind — confirmed correctly absent in phase2-model-cards.md's P8 section; if a future
revision reaches for one, that is a new model-card question, not a v1 concern. No CLI, no published
npm package (unlike sluice/snapgauge/chaff/tiltmeter/dogwatch) — this is a web tool for an anonymous
visitor, not developer infrastructure. No accounts, no sharing, no server-side persistence of pasted
data, ever — persistence would itself break the privacy claim this project is built to make.

## 2. The analytical claim — answered first, because it is the death condition

**What a physics layout reveals that a bar chart or scatter plot hides.** A conventional chart requires
choosing 1-2 axes before you look. With more than two informative numeric columns, the joint structure
across all of them is invisible to any single chart unless you already know which two columns matter —
which is usually the thing you're trying to find out. A force-settled layout is a physically legible
multivariate embedding: every mapped column contributes a force simultaneously, and the settled
position of a point is jointly determined by all of them at once, not by two chosen axes. Concretely,
this earns four kinds of finding a bar chart/scatter plot cannot:

- **Clusters across >2 columns** — points that agree on several attraction-mapped columns converge
  physically, even when no single pair of columns would separate them in a 2D scatter.
- **Outliers as a physical fact, not a per-column flag** — a point far from everything on the mapped
  dimensions fails to find a stable position near any cluster and visibly ends up at the periphery,
  distinct from a boxplot's single-column-at-a-time outlier test.
- **Whether two columns actually correlate** — map one column to attraction weight and another to
  spring stiffness; a layout that settles calmly says they pull together, one that stays jittery and
  fights itself says they don't. This is a physical, watchable signal for correlation strength, not
  just a coefficient printed as a number.
- **Group separation as a real test, not an assumption** — a categorical column mapped to charge sign
  physically repels its groups apart *if the other mapped columns actually support that separation*.
  If the groups interpenetrate instead, that is the finding ("these categories don't separate on the
  columns you mapped"), not a rendering failure.

**How the product earns this claim, mechanically, not rhetorically.** Every session computes and
prints a **separation-gain** number: the best-achievable 2-axis view (silhouette score of a k-means
assignment on the top-2 PCA components of the mapped numeric columns) versus the same silhouette score
computed on the final settled physics positions, at the same k. `k` comes from the visitor's own
categorical mapping when one exists (its distinct-value count); otherwise the best of k ∈ {2,3,4} is
reported for both sides, so the comparison is always apples-to-apples. k-means here is an internal
scoring tool only — never the rendered layout — and the page states that distinction so a technical
reader does not assume a hidden clustering model drives the visuals.

- `physicsSilhouette − pca2dSilhouette ≤ 0.05` → the page prints, verbatim: **"No meaningful gain over
  a 2-axis view (silhouette 0.xx vs 0.xx) — a scatter plot would show you the same thing."** Both raw
  numbers are always shown, win or lose.
- `> 0.05` → **"Physics separates this data better than the best 2-axis view (0.xx vs 0.xx) — these
  columns are doing joint work no single scatter plot shows."**

This is the mechanism, not a promise: the golden-fixture eval (§13) asserts a real dataset scores
"stronger" and a genuinely random one scores "no meaningful gain," so a future change that quietly
breaks the claim fails CI before it ships a page whose central sentence is no longer true.

## 3. Data model

**Decision 1 — there is no server-side data model.** No table, no key, no persistence layer. The
entire session state is the visitor's own pasted text held in JS memory. This is not an omission; it
is the design, because persisting pasted data would contradict the privacy claim the project exists to
make (§8). Everything below is an in-memory, client-only shape.

**Decision 2 — rank/percentile normalization is the default for every numeric mapping, not min-max.**
This is what prevents the "one point becomes a black hole" failure: a raw-value or min-max mass mapping
lets a single extreme outlier dominate every force calculation and collapse the rest of the layout to
invisibility. Rank normalization maps each value to its percentile within its own column (0..1) before
any physical range is applied, so the largest value in a column is always rank 1.0 regardless of
whether it is 2x or 200x the median — an extreme outlier cannot single-handedly dominate the force
field. A `"raw"` mode exists as an explicit, visitor-toggled opt-in (default off) with an on-page
warning, for visitors who want the exaggeration deliberately.

**Decision 3 — the force-mapping config is a typed, serializable, seedable object, never implicit
code.** This is what lets the CPU/JS reference core, the WGSL compute path, and the CI golden fixtures
all agree on "what physics actually ran," and lets a PNG export carry its own config as reproducible
metadata (§9) — the same determinism discipline the rest of the program applies to brand assets and
snapshot canonicalization.

```ts
type ColumnType = "numeric" | "categorical" | "boolean" | "id-like" | "date"
type ColumnRole = "mass" | "charge" | "attraction" | "viscosity" | "spring-anchor" | "label" | "excluded"

interface ColumnMapping {
  name: string
  inferredType: ColumnType          // numeric: >90% of non-null rows parse as float
                                    // categorical: distinct/rows < 0.5 AND distinct <= 12
                                    // id-like: distinct/rows >= 0.9 (excluded from forces, label only)
  role: ColumnRole                  // auto-inferred (below), visitor-overridable per column
  normalization: "rank" | "raw"     // default "rank"
  missing: { count: number; strategy: "median-rank" }  // nulls placed at rank 0.5, never at 0
}

interface SimConfig {
  seed: number                      // mulberry32 seed; printed on-page for reproducibility
  dt: number                        // fixed, 1/60
  columns: ColumnMapping[]
  forces: {
    centering: number; attraction: number; charge: number
    viscosityBase: number; spring: number; collision: number
  }
  pointBudget: number               // resolved per rung, §5
}

interface SimState {
  rung: "webgpu" | "webgl2" | "static"
  positions: Float32Array           // n * 2 (3D is a future mode — v1 is 2D)
  velocities: Float32Array
  step: number
  temperature: number               // anneal factor, 1.0 -> 0.15 floor
  keHistory: number[]               // ring buffer, convergence check
  converged: boolean
  separationGain: { pca2dSilhouette: number; physicsSilhouette: number; k: number;
                    verdict: "stronger" | "no-meaningful-gain" | "insufficient-variance" }
}
```

**Auto-mapping defaults (transparent, always overridable in the UI):** mass ← the numeric column with
highest coefficient of variation; charge ← the first categorical column with 2-6 distinct values;
attraction ← the second-most-variable numeric column; viscosity ← the next categorical/binned column,
or a flat default if none exists; spring stays **off by default** — most pasted CSVs have no explicit
edge relationship, so it activates only when the visitor wires two columns as a from/to pair, avoiding
a force nobody asked for. High-cardinality/id-like columns are auto-excluded from every role and offered
only as row labels, so a near-unique ID column can never become a meaningless N-way charge split.

## 4. The simulation

**Forces.** Global centering spring (weak, constant, keeps the composition framed) · pairwise
attraction/repulsion scaled by similarity on attraction-mapped column(s) (the clustering force) ·
global charge repulsion/attraction by sign (the group-separation force) · per-particle viscosity =
velocity damping from the viscosity-mapped column (reads as "sluggish" subgroups) · optional Hookean
spring, only when an explicit pairwise relation is mapped · short-range soft collision repulsion (fixed
constant, not user-mapped, so particles never pile into an unreadable stack).

**Integration.** Fixed timestep, semi-implicit (symplectic) Euler at `dt = 1/60s`, decoupled from actual
frame rate via an accumulator (a slow frame simulates multiple fixed steps, clamped to avoid a spiral
of death). RK4 is not used — this is a readability tool, not an engineering simulation, and symplectic
Euler's stability at fixed `dt` is the right complexity for the fidelity this needs.

**Stability, explicit.** (1) Velocity clamp, hard, every step — no single force spike ejects a particle
to infinity. (2) Force denominator uses `r² + ε`, never bare `r²` — no divide-by-near-zero singularity
when two mapped points are nearly identical. (3) Global drag (`v *= 1 − dragCoefficient`, scaled by the
viscosity mapping plus a small baseline) — the system must *lose* kinetic energy to settle; true energy
conservation would jitter forever, which is the wrong behavior for a result meant to be read. (4)
Simulated annealing: attraction/charge magnitudes are multiplied by a temperature that decays
exponentially from 1.0 toward a 0.15 floor with roughly a 45-step half-life, reaching the floor by
~step 180 (3s at 60fps) — this is what lets the layout cool into one stable configuration instead of
oscillating between two.

**Convergence rule — when "still moving" becomes a readable result.** Track mean particle speed each
step in a 30-step ring buffer (~0.5s). Converged when that moving average drops below
`0.0015 × boundingBoxDiagonal` (relative to the layout's own scale, not an absolute constant, so it
works the same on a tiny CSV and a 50,000-row one) for 45 consecutive checks (~0.75s, debounced against
a momentary lull). At convergence: the temperature is already at its floor, the page switches from
"Settling…" to **"Settled after 4.2s, 252 steps"** (a real, computed receipt, not a spinner), and the
force-integration dispatch pauses — rendering and interaction (camera, hover, drag) keep running at
60fps from the frozen positions. Dragging a particle re-injects energy and resumes stepping through the
identical rule; there is no separate "resettle" code path.

## 5. The compute path

**A conflation to avoid, named explicitly.** creative-tech §1's 100k-1M (Tier A) / 20k-100k (Tier B)
numbers are for **point-sprite rendering** — particles that move along a formula, no real per-particle
force state. clarifier's particles carry real simulated behavior (mass, charge, attraction), which is
squarely §1's "compute-shader simulation (boids/N-body)" row and §5.5's swarm shape: **10k-50k agents
at 60fps on WebGPU-capable Tier A/B hardware.** That lower number, not the rendering ceiling, is the
real budget — the renderer has headroom to spare; force integration is the bottleneck.

| Rung | Budget | Basis |
|---|---|---|
| WebGPU, Tier A (mid-2020s laptop, integrated graphics) | up to 50,000 rows at 60fps | creative-tech §5.5 |
| WebGPU, Tier B (mid-range Android, 2023-2025) | 10,000-20,000 rows at 60fps | lower end of §5.5's range; Tier B is bandwidth-bound throughout §1 |
| WebGL2 fallback (any tier) | 2,000-5,000 rows | §5.5's own WebGL2/transform-feedback boids fallback states "roughly 2k-8k agents"; a pure-JS CPU physics step is slower than GPU transform-feedback ping-pong, so this lands at the conservative end |
| Static rung | 2,000 rows (single headless solve, same CPU/JS path) | same CPU-physics cost, no render-loop cost to offset it |

Above the resolved budget for any rung, the app takes a **stratified random sample** (preserving
category proportions on the primary charge-mapped column, if any) down to the budget and states this
plainly next to the effect: *"12,480 of 214,382 rows shown, stratified sample."* Never a silent
truncation.

**Neighbour search.** Naive all-pairs O(n²) below 5,000 points — a workgroup-tiled WGSL kernel handles
this comfortably inside a 60fps budget at this row count (≈25M simple pairwise force evaluations/frame
at the top of that range). Above 5,000, switch to uniform spatial-grid binning: particles are hashed
into 2D grid cells each step, and force evaluation only considers same/adjacent cells — the standard
technique that takes short-range n-body interaction from O(n²) toward ~O(n).

**Per frame vs. per settle-step.** There is no separate render-only tier: while unconverged, the force
dispatch runs once per animation frame at the fixed `dt` from §4 (decoupled via the accumulator); once
converged, the dispatch is skipped and only the render pass runs, every frame, for camera/hover/drag.

## 6. The fallback ladder

**WebGPU compute → WebGL2 instanced (reduced budget) → static, truthful, non-animated.** No WebGPU
must never mean a broken page or a silently lesser result presented as the real thing.

1. **WebGPU compute** (default). Detected via a real `navigator.gpu.requestAdapter()` call — not
   `'gpu' in navigator`, which can be true with no usable adapter (creative-tech §4). Force integration
   in a WGSL compute shader per §5's algorithm; point-sprite render via a WebGPU render pipeline.
2. **WebGL2 instanced fallback.** WebGL2 has no compute shaders, so physics runs on the CPU (main
   thread or a Web Worker) at the reduced 2,000-5,000-row budget, using the *same* algorithm ported to
   JS, not a different simplified one. Rendering stays WebGL2 `InstancedMesh`, which has far more
   headroom (creative-tech §3: 50k-200k simple instances at Tier A) — the renderer is never the
   bottleneck here. Detected via a real WebGL2 context-creation probe. Capability line: **"Running on
   WebGL2 — showing 3,241 of 3,241 rows, simplified physics."**
3. **Static rung** (no usable WebGPU and no usable WebGL2, OR `prefers-reduced-motion`). Runs the same
   CPU/JS algorithm to convergence once, headless (no per-frame render during the solve), at the
   2,000-row static budget, then renders a single Canvas2D/SVG frame of the real converged output — a
   genuine result of the real algorithm, not a placeholder. Capability line: **"Running the CPU
   fallback, same result, static."** `prefers-reduced-motion` forces this rung independently of
   capability — even a WebGPU-capable Tier-A machine gets the static output when reduced motion is set,
   re-checked live via a `matchMedia` listener (not just at page load).

Detection is always a real capability probe, never user-agent sniffing.

## 7. Module / boundary map

```
clarifier/                              (single-package Next.js 16 app, public repo jamessuuu/clarifier)
  src/
    core/       physics: force calc, symplectic integrator, spatial grid, convergence detector,
                separation-gain metric (PCA + k-means-as-scoring-tool + silhouette).
                Pure, isomorphic TS. Zero DOM, zero navigator.gpu, seedable (mulberry32). This is the
                one implementation CI's eval runs against (§13) and the one the WGSL kernel must agree
                with within a stated tolerance.
    csv/        parse + type inference + normalization (§3). Pure, zero DOM.
    gpu/        WebGPU path: adapter/device management, WGSL kernels mirroring core/'s semantics,
                point-sprite render pipeline.
    gl/         WebGL2 path: capability probe, InstancedMesh renderer, CPU-physics adapter over core/.
    static/     Canvas2D/SVG static renderer (rung 3) + the accessible text results panel (§11).
    ui/         mapping panel, capability line, dataset picker, export button — real DOM controls,
                never canvas-drawn UI (§11).
    app/        routes (below).
  public/brand/     brand assets per BRAND-KIT.
  public/samples/   the bundled sample CSVs (§10) + the seeded synthetic generator script.
  evals/            golden fixtures + CI eval runner — CPU/JS core only; GitHub Actions runners have no
                    GPU, so the WGSL path cannot be exercised in CI, a real and stated constraint.
  scripts/brand.mjs docs/SPEC.md, docs/quickstart, docs/concept, docs/failure-modes, docs/limitations
```

**What stays isolated.** `core/` never imports the DOM or `navigator.gpu` and never opens a socket.
`gpu/` and `gl/` each own their capability probe and fallback trigger, but both consume the same
`SimConfig`/`ColumnMapping` types from `core/`, so the mapping UI never needs to know which rung is
active. Same isolated-pure-core shape as snapgauge's `core/`+`node/` split, applied to physics backends
instead of network transports.

**No CLI, no published package in v1.** A future `@jamessuuu/clarifier-core` split is plausible if
there is ever demand — not needed for v1 and not built until there is a real second consumer.

## 8. Privacy and cost — routes, and why there is no API

**Routes.** `/` (the tool + hero), `/docs`, `/docs/quickstart`, `/docs/concept`, `/docs/failure-modes`,
`/docs/limitations`. Every route is static or fully client-rendered. **There is no API route at all** —
not even a read-only one, unlike every other project in this program. That is a deliberate design
choice, not an oversight: since there is no server compute anywhere in the product, `npx vercel --prod`
emits a static export with zero serverless functions, which trivially satisfies D2 (no model call, no
cost ceiling to set) and D3 (nothing to blackout — every route already renders with every function
paused, because none exist) by construction rather than by careful engineering.

**CSV handling.** Parsed from `File`/`FileReader`/paste event into an in-memory string, held only in JS
memory (or, transiently, an in-page Web Worker for large pastes — §12). Never sent via `fetch`,
`XMLHttpRequest`, or `navigator.sendBeacon`; never written to `localStorage`/`IndexedDB`/cookies unless
the visitor explicitly exports (§9), which is a client-initiated download, not a network call.

**What the Network tab shows.** On first load: the JS/WASM bundle, brand assets, fonts/CSS — a small,
fixed, enumerable set of same-origin requests. After pasting a CSV and running the simulation: **zero
additional network requests**, directly verifiable in DevTools — the same "empty Network tab" receipt
chaff already proved for this program. The page states the claim precisely — *your data never leaves
your device* — and links to the exact DevTools check, rather than an unqualified "100% private" line.

**Cost at any traffic.** Static hosting only, no per-request compute of any kind, $0 at any scale, no
Vercel Hobby cliff to name because there is no compute path to hit a cliff. D1's no-hire-me-CTA
convention still applies (identity, not revenue); D4/D5 (scheduler, Neon storage) are N/A.

## 9. Export

**In v1: a PNG frame, yes. A WebCodecs clip, no — deferred, named, not silently dropped.**

Frame export (`canvas.toBlob()` / WebGPU-WebGL readback → PNG) is nearly free: no muxing, no timing, no
new failure surface, and it directly answers creative-tech §5.1's own honesty bar — "should double as
something a visitor can screenshot/export, not just watch once." The exported PNG's filename/metadata
carries the `SimConfig` (seed, mappings, step count) so the exact frame is reproducible. Exporting
before convergence is allowed and labeled as such ("step 88, not yet settled"), never presented silently
as a final result.

Clip export (WebCodecs) is real and mature per creative-tech §1's own table, but for a *live physics
simulation specifically* it means synchronizing the compute-shader step loop with an encoder's frame
pacing without physics/video desync on a dropped frame, plus a container muxer (WebCodecs emits raw
encoded chunks, not a playable file). None of that changes the analytical claim in §2, which a still
frame with its printed separation-gain number already carries in full. Named as a sized, explicit
post-cut-line increment (M6, §15), not cut silently.

## 10. The cold start

Most visitors arrive with nothing to paste. The default view is never an empty box.

**Sample datasets (bundled as static assets, not fetched live — keeping the "nothing leaves your
device" claim clean even for the app's own fixtures):**

1. **A real, small, permissively-licensed dataset with genuine multi-column structure** (~150-300 rows,
   CC0/permissive, cited by name and license on-page). Chosen specifically because it has more than two
   informative numeric columns, so §2's separation-gain metric has an honest, positive story on it —
   this must be verified at build time by actually running the metric against the shipped fixture, not
   assumed; if the number doesn't come out meaningfully positive, the dataset is swapped, not the claim
   faked.
2. **A synthetic, seed-generated dataset**, explicitly labeled "synthetic, generated for this demo" —
   never presented as real-world data. Deterministic (mulberry32-seeded, committed generator script),
   known ground-truth cluster count, so a first-time visitor sees "3 known groups, physics found 3" as
   a legible proof before trusting the tool on their own data.
3. **A deliberately boring/uncorrelated dataset**, to show the death-condition guard actually fire —
   "physics finds nothing here beyond 2 columns; here's the honest scatter plot." This is the single
   strongest piece of evidence density the page can carry, since it demonstrates the tool refusing to
   overclaim rather than merely asserting that it would.

**First ten seconds, no CSV pasted.** The page loads directly into sample dataset #1, already
mid-settle — never an empty "waiting for input" state (DESIGN-DIRECTION §1). A labeled "Paste your own
CSV" target sits alongside, with a one-line note under the running demo: *"This is a real dataset
(citation) — paste your own any time."*

## 11. Accessibility

**`prefers-reduced-motion`** gets the exact rung-3 static output from §6 — the same converged positions
from the same algorithm, never a lesser or different result, simply not animated. Re-checked live via
`matchMedia`, not just at load.

**The non-animated equivalent that conveys the same finding.** Alongside the canvas, a real HTML results
panel — not decorative alt text — states, generated from the same numbers the physics view computes:
cluster count found, the defining columns and value ranges of the largest clusters, the outlier row
count and which rows, and the separation-gain numbers from §2. A screen-reader visitor gets the actual
finding, not a description of a picture.

**Keyboard access.** Every control (column-mapping dropdowns, force toggles, dataset picker, export,
play/pause) is a real focusable, labeled HTML form element — never canvas-drawn UI. Dragging a particle
with a mouse is an enhancement layered on top of a fully keyboard-operable settings panel, never the
only way to change a mapping.

**Inherited, binding.** Contrast ≥4.5:1 body text against PAPER; the mechanism diagram (the
column→force→visible-effect table, drawn in the house line language) carries a real `<title>`/`<desc>`;
one amber element only.

## 12. Failure contracts

| Situation | Contract |
|---|---|
| CSV fails to parse / not tabular (JSON, prose pasted) | Structured error naming what was detected instead ("looks like JSON, not CSV") — never a partial/garbage render. |
| Zero usable columns (all id-like/high-cardinality/all-null) | Refuse gracefully: "no columns here map to a physical property," with which columns were seen and why each was excluded. Never an empty canvas with no explanation. |
| 1 row, or all rows identical on every mapped column | Separation-gain marked `insufficient-variance`, with its own honest copy ("no variation in the data you mapped"), distinct from a computed-and-low `no-meaningful-gain` verdict — different findings, must not share a sentence. |
| `requestAdapter()` returns null | Caught; falls to WebGL2 rung. Never an uncaught rejection. |
| WebGL2 context creation also fails | Falls to the static rung. |
| CSV larger than the resolved point budget | Parsed in a Web Worker (never blocks the paste UI); stratified sample down to budget, stated plainly (§5). |
| Visitor drags a particle mid- or post-settle | Re-injects energy, resumes stepping under the same convergence rule (§4) — no special-case path. |
| Simulation numerically diverges despite the §4 clamps | Hard NaN/Infinity guard every step; on detection, freeze at the last stable frame, log a console warning, show "simulation became unstable — showing the last stable frame." Never renders NaN positions as a blank/garbage canvas. |
| Export requested before convergence | Allowed; filename/metadata states the step count and "not yet settled." Never presented as final silently. |
| `prefers-reduced-motion` toggled mid-session | Live `matchMedia` listener switches to the static rung immediately, not only on next load. |

## 13. Eval / golden set (CI)

**Determinism, precisely.** The physics core (§7 `core/`) is pure and seedable: given a fixed
`mulberry32` seed (never `Math.random`, matching the program's own brand-generator convention), a fixed
`dt`, a fixed step count, and a fixed `SimConfig`, it produces an exact, reproducible final position set
(bit-identical on one platform; asserted within a small numeric tolerance across platforms for
floating-point variance). GitHub Actions runners have no GPU, so **CI exercises the CPU/JS reference
core only** — the WGSL path is never run in CI; that is a stated constraint, not an oversight, and a
real-device pass against real WebGPU hardware is a build-time, not CI-time, check.

**Fixtures.** `blobs-3-known` (the seeded synthetic generator from §10, 3 Gaussian clusters in 5
dimensions, ground truth = 3) · `uncorrelated-random` (deliberately structureless, same generator,
different seed) · `single-column-degenerate` (all rows identical on every mapped column) · `one-row` ·
`high-cardinality-id-only` (every column excluded by the role inference). Each fixture has a committed
expected result: `separationGain.verdict` and a numeric tolerance band on both silhouette scores, plus
(for `blobs-3-known`) the exact converged step count and a tolerance band on final positions.
**Bar: 100% match on every fixture; CI fails on any drift.** Two additional gates, mirroring the
program's own stability convention: record-twice-is-identical (same seed, same config → identical
output), and shuffle-input-row-order-is-identical (modulo row identity).

**CI stages:** `typecheck → lint → unit (core, csv, normalization) → e2e:smoke (Playwright: load →
sample dataset settles → capability line renders → mapping override works) → eval (fixtures above)`.

## 14. Acceptance criteria

**Brand (BRAND-KIT).** Glyph: a settling vessel — three horizontal bands (turbulent inlet, sediment,
clarified layer), ink strokes, one amber element on the uppermost clarified band — the moment jumbled
input becomes separated and legible. Compact/favicon variant purpose-drawn (a vessel silhouette is
visually distinct from every existing glyph — none of the five phase-1 marks is a container shape — so
it clears BRAND-KIT's sibling-distinguishability bar). Full icon family, footer attribution + backlink
on every page, README lockup + portfolio footer, deterministic `scripts/brand.mjs`, build-time OG image,
brand-asset license carve-out. No hire-me CTA (D1).

**Content/features (QUALITY-BAR, DESIGN-DIRECTION).** Every number on the page is computed from the
loaded dataset, never hand-typed. Hero shows the running demo mid-settle, never an empty state. One
mechanism diagram (column → force → visible effect, one amber element). A scripted Playwright recording
against the **deployed** site (autoplay, muted, looped, poster frame, `prefers-reduced-motion` gets the
poster + link only). `/docs` per DESIGN-DIRECTION §4. Degrades honestly across every rung in §6.
Renders at 320px. Ten-second test: a senior engineer looking at the hero for ten seconds can state what
the tool found, not just that it looks good.

**Engineering.** Typed strict boundaries; no `as any` at CSV parse (the one genuinely untyped external
input). Zero-server-function build (§8) — verify the Vercel build output has no functions, not just that
it deploys. Five-stage CI green on GitHub Actions, not just locally. Adversarial review pass before
publication, per the program's standing rule.

## 15. Build order

| M | Deliverable | Green gate |
|---|---|---|
| **M0** | Workspace, TS strict, ESLint, Vitest, Playwright, CI skeleton, brand assets, static `/` deployed with zero functions | CI green; `/` live; build output has no serverless functions |
| **M1** | **Walking skeleton:** CPU/JS `core/` (pure, seeded), CSV parse + type inference, naive O(n²) force calc capped ~500 rows, Canvas2D render, no capability ladder yet | Paste `blobs-3-known`, watch it settle into 3 visible clusters; determinism eval passes |
| **M2** | Column-mapping UI (auto-infer + overrides), rank normalization, sparse/outlier handling, separation-gain metric wired and printed | `uncorrelated-random` prints "no meaningful gain" with real numbers; `blobs-3-known` prints "stronger" — both asserted in the eval, not eyeballed |
| **M3** | WebGL2 instanced render + CPU physics at the rung-2 budget; real capability detection + on-page capability line; static rung-3; `prefers-reduced-motion`; accessible text results panel | Forcing each rung via mocked adapters renders correctly labeled, never blank; reduced-motion forces static on a mocked WebGPU-capable device |
| **M4** | WebGPU compute path (WGSL force integration, spatial-grid binning above 5,000 rows), scaled to §5 budgets | Real `requestAdapter()` path exercised on real WebGPU hardware; frame time measured and logged at a stated point count, not assumed |
| **M5** | Sample datasets finalized and licensed (§10), cold-start hero, PNG export, mechanism diagram + demo recording against the deployed site + `/docs` | QUALITY-BAR checklist run against the deployed site; ten-second test passed by someone unfamiliar with the project |
| **M6** (post-cut-line) | WebCodecs clip export (§9) | — |

**Cut line:** M0-M5 is the complete, honest, publishable tool — full fallback ladder, real sample data,
the death-condition guard demonstrably firing, brand, docs, demo recording. M6 is the amplifier.

## 16. Open questions (deferred to the main session / James)

1. **Sample dataset #1's exact identity and license text** — needs a live confirm-and-attribute pass at
   build time; a candidate is described in §10 but not locked here.
2. **Spatial-grid cell-size tuning above 5,000 rows** — a performance measurement question once real
   Tier A/B hardware is available, not a spec-time constant.
3. **Whether springiness ships any UI surface in v1** — §3 scopes it auto-disabled-unless-detected;
   confirm at build time whether the toggle earns its screen space.
4. **Tier A/B point-budget numbers are inherited from creative-tech §5.5, not independently re-measured
   for clarifier** — phase2-model-cards.md explicitly routed P8's throughput question to creative-dev
   and declined to re-verify it. A real-device pass (one Tier A laptop, one Tier B Android) before
   locking a formal Perf Budget is still owed.
5. **Hosting specifics beyond Vercel** — no compute path exists either way, so this is a preference
   call, not a design decision.
