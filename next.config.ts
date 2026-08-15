import type { NextConfig } from "next";

/**
 * SPEC.md §8/§14: clarifier ships ZERO server functions — no route handlers,
 * no middleware, no runtime image optimization, every route prerendered to
 * static HTML/JS. `output: "export"` is the guarantee, not a claim: Next.js
 * refuses to emit anything that would require a server (dynamic route
 * handlers, middleware, the image-optimization API) and instead writes a
 * plain static `out/` directory. scripts/assert-zero-functions.mjs
 * re-verifies this from the build artifact rather than trusting this file.
 */
const nextConfig: NextConfig = {
  output: "export",
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
