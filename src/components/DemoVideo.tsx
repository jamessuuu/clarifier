"use client";

import { useReducedMotion } from "@/ui/useReducedMotion";

/**
 * showcase-program/DESIGN-DIRECTION.md §3: "autoplay, muted, looped, no
 * browser chrome, no cursor jitter. A poster frame... prefers-reduced-motion
 * gets the poster frame and a link, never an autoplaying video." Recorded by
 * scripts/record-demo.mjs against the local static export — see
 * /docs/limitations for why that differs from that document's "must be
 * recorded against the deployed site" (this build makes zero deploys).
 */
export function DemoVideo(): React.JSX.Element {
  const reducedMotion = useReducedMotion();

  return (
    <figure className="mt-4">
      {reducedMotion ? (
        <a href="/demo/clarifier-demo.webm" data-testid="demo-video-link">
          <img
            src="/demo/poster.png"
            alt="Poster frame: clarifier settling the Palmer Penguins sample dataset. Reduced motion is on, so the recording is a link, not an autoplaying video."
            className="w-full rounded-[var(--radius-brand)] border border-rule"
          />
        </a>
      ) : (
        <video
          data-testid="demo-video"
          autoPlay
          muted
          loop
          playsInline
          poster="/demo/poster.png"
          aria-label="Recording of clarifier settling the Palmer Penguins sample dataset, then switching to the synthetic 3-cluster sample"
          className="w-full rounded-[var(--radius-brand)] border border-rule"
        >
          <source src="/demo/clarifier-demo.webm" type="video/webm" />
        </video>
      )}
      <figcaption className="mt-2 text-xs text-ink/60">
        Recorded against the real local build (<code>pnpm build</code> + <code>scripts/serve-out.mjs</code>), not a screencast — every frame is the actual
        tool.
      </figcaption>
    </figure>
  );
}
