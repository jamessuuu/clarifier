@AGENTS.md

# clarifier — working agreements

Physics-driven CSV visualization, zero server compute. Read `docs/SPEC.md`
before changing behavior — it is binding; this file is the short version for
day-to-day work.

## Layout

- `src/core/` — the pure physics engine (force calc, symplectic integrator,
  convergence detector) plus `separation-gain.ts` (PCA + k-means-as-scoring
  + silhouette). Never add DOM, `navigator.gpu`, or Node I/O here — enforced
  by `eslint.config.mjs`'s `no-restricted-imports`/`no-restricted-globals`
  block on `src/core/**`, not just convention. This is the one implementation
  `evals/` runs against and the one the WGSL kernel in `src/gpu/` must agree
  with (documented per-function, since GitHub Actions has no GPU to test it
  against directly — SPEC.md §13).
- `src/csv/` — parse, type inference, normalization, and
  `resolve-forces.ts` (the glue from `ColumnMapping[]` to `core/`'s
  `ForceField`). Pure, zero DOM.
- `src/gpu/`, `src/gl/`, `src/static/` — the three fallback-ladder rungs
  (SPEC.md §6). `gl/` and `static/` reuse `core/`'s CPU step function
  directly; `gpu/`'s WGSL kernel is a hand-port, not a shared implementation.
- `src/ui/` — real DOM controls only (mapping panel, capability line,
  dataset picker, export button, the canvas host). Never canvas-drawn UI for
  anything a screen reader or keyboard-only visitor needs to operate.
- `evals/` — golden fixtures (SPEC.md §13) + the CI eval runner, CPU/JS core
  only.
- `scripts/` — brand.mjs (the showcase-program generator, extended with
  clarifier's own glyph), diagram.mjs, gen-samples.mjs, the CI gate scripts.

## Before committing

Run the gate in order: `pnpm typecheck`, `pnpm lint`, `pnpm test`,
`pnpm build`, `pnpm e2e:smoke`, `pnpm ci:zero-functions`, `pnpm eval`. Add
`pnpm ci:brand-check` / `pnpm ci:diagram-check` / `pnpm ci:samples-check`
when the change touches `public/brand/`, `public/diagram/`, or
`public/samples/` — each regenerates from its committed generator script and
fails on any diff, so a fixture or glyph edit needs the matching `pnpm
brand`/`pnpm diagram`/`pnpm gen:samples` run before it commits.

## Rules specific to this project

- Every numeric mapping defaults to rank normalization, never min-max — that
  is what stops one outlier from collapsing the whole layout (SPEC.md §3
  Decision 2). Don't "fix" a black-hole-looking layout by switching the
  default; that failure mode is the reason the default exists.
- No number on `/` or `/docs` is hand-typed. If a claim needs a number, wire
  it to the real computation, even in a stub — QUALITY-BAR.md's "every
  number generated from the repo" is checked, not assumed.
- The WGSL compute path is never exercised in CI (no GPU on GitHub Actions
  runners) and may also have no adapter in a local sandboxed browser — a
  test that needs real WebGPU hardware is skipped with a visible, named
  reason, never silently green.
