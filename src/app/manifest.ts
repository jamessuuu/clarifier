import type { MetadataRoute } from "next";

import { SITE } from "@/lib/site";

// Required under output: "export" — otherwise Next treats this route as
// dynamic and the static export build fails. The manifest has no dynamic
// data (no headers()/cookies()), so force-static is honest, not a workaround.
export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "clarifier: physics-driven data visualization",
    short_name: "clarifier",
    description: SITE.tagline,
    start_url: "/",
    display: "standalone",
    theme_color: "#0F131A",
    background_color: "#0F131A",
    icons: [
      { src: "/brand/icon-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/brand/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
