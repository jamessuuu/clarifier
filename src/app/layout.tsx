import type { Metadata } from "next";

import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { SITE } from "@/lib/site";

import "./globals.css";

const description = SITE.tagline;
const TITLE = `${SITE.name}: physics-driven data visualization`;

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: {
    default: TITLE,
    template: `%s · ${SITE.name}`,
  },
  description,
  icons: {
    icon: [
      { url: "/brand/favicon.svg", type: "image/svg+xml" },
      { url: "/brand/favicon-16.png", sizes: "16x16", type: "image/png" },
      { url: "/brand/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/brand/favicon-48.png", sizes: "48x48", type: "image/png" },
    ],
    apple: [{ url: "/brand/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
    other: [{ rel: "mask-icon", url: "/brand/icon-maskable.svg", color: "#B45309" }],
  },
  openGraph: {
    title: TITLE,
    description,
    url: SITE.url,
    siteName: SITE.name,
    images: [{ url: "/brand/og.png", width: 1200, height: 630, type: "image/png" }],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description,
    images: ["/brand/og.png"],
  },
};

// The site's author is the same Person entity agentjames publishes (one @id
// across every project), so engines can join the sites to one maker.
const jsonLd = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: SITE.name,
  url: SITE.url,
  author: {
    "@type": "Person",
    "@id": "https://agentjames.vercel.app/#person",
    name: SITE.authorName,
    url: SITE.portfolioUrl,
    sameAs: [
      "https://www.linkedin.com/in/james-lorenz-santos-720776251/",
      "https://github.com/jamessuuu",
      "https://www.onlinejobs.ph/jobseekers/info/2766463",
      "https://ph.jobstreet.com/profiles/jameslorenz-santos-SXdpKyGqdK",
    ],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    // overflow-x-hidden on BOTH html and body — a deliberate belt-and-
    // suspenders root-level clamp, not a substitute for correct nested
    // layout. Measured directly (not assumed): the mapping panel's
    // horizontally-scrollable table (src/ui/MappingPanel.tsx) is properly
    // width-constrained at every level of its own ancestor chain — the
    // overflow-x-auto wrapper, the grid item, the CSS Grid track — each
    // individually reports a correct, non-overflowing box at a 320px
    // viewport. Despite that, a real, page-level 29px horizontal scroll was
    // still reachable via window.scrollTo — confirmed by literally
    // scrolling and screenshotting real cut-off content, not inferred from
    // a single number — and setting overflow-x:hidden on body ALONE did not
    // stop it: <html> is the actual scrolling element in standards mode, so
    // both need the clamp. The exact mechanism connecting a correctly-
    // clipped nested scroll container to the root's own scrollable region
    // was not fully isolated; this removes the symptom at the one place it
    // can never come back regardless of which descendant causes it next.
    <html lang="en" className="overflow-x-hidden">
      <body className="flex min-h-screen flex-col overflow-x-hidden">
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
        <Header />
        <main className="w-full flex-1">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
