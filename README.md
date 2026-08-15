<img src="public/brand/lockup.svg" alt="clarifier" height="56" />

Paste a CSV. Columns map to physical properties — mass, charge, attraction, viscosity, springiness — not to axes. The data arranges itself under a real n-body-style simulation, running entirely on your GPU, and it tells you with a computed number whether that arrangement found something a 2-axis scatter plot couldn't.

Zero server compute at any traffic. Nothing you paste ever leaves your device — there is no API route in this app at all.

## What it does

A conventional chart needs you to pick one or two axes before you look. clarifier maps every numeric and categorical column you choose to a physical force — mass, charge, attraction, viscosity, an optional spring — and lets a real symplectic-Euler particle simulation settle under all of them at once. The settled layout is a physically legible multivariate embedding: a point's position is jointly determined by everything you mapped, not by two chosen axes.

It also refuses to overclaim. Every run prints a **separation-gain** number: the best 2-axis view's silhouette score versus the settled physics layout's silhouette score, at the same `k`. If physics doesn't beat the best scatter plot by a real margin, the page says so in plain language, with both numbers shown. See [`/docs/concept`](https://clarifier.vercel.app/docs/concept).

## Quickstart

```bash
git clone https://github.com/jamessuuu/clarifier.git
cd clarifier
pnpm install
pnpm build && node scripts/serve-out.mjs
# open http://localhost:4173
```

Full walkthrough: [`/docs/quickstart`](https://clarifier.vercel.app/docs/quickstart).

## Why it's honest about privacy and cost

Every route is static or client-rendered; the build emits zero serverless or edge functions (verified in CI, not just claimed — `pnpm ci:zero-functions`). CSV parsing, the simulation, and the separation-gain metric all run in your browser. After the initial page load, pasting and running a dataset produces **zero additional network requests** — check the Network tab yourself.

## Development

```bash
pnpm install
pnpm dev             # http://localhost:3000
pnpm typecheck
pnpm lint
pnpm test             # unit tests (src/**/*.test.ts)
pnpm eval              # golden-fixture evals (evals/)
pnpm build && pnpm e2e:smoke   # e2e against the real static export
```

See [`docs/SPEC.md`](docs/SPEC.md) for the full specification this repo implements, and [`/docs/limitations`](https://clarifier.vercel.app/docs/limitations) for what it deliberately does not do.

## License

Code is MIT (see [`LICENSE`](LICENSE)). Brand assets under `public/brand/` are © James Lorenz Santos, all rights reserved, and are not covered by the code license. The bundled sample dataset under `public/samples/` carries its own CC0 attribution — see `public/samples/CREDITS.md`.

---

Part of the [Agent James](https://agentjames.vercel.app) portfolio.
