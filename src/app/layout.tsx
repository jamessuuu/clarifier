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

export default function RootLayout({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <html lang="en">
      <body className="flex min-h-screen flex-col">
        <Header />
        <main className="w-full flex-1">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
