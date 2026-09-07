import Link from "next/link";

import { SITE } from "@/lib/site";

export function Header(): React.JSX.Element {
  return (
    <header className="sticky top-0 z-30 border-b border-rule bg-paper/85 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-6 py-4">
        <Link href="/" prefetch={false} className="flex items-center gap-2 font-house-mono text-base tracking-tight hover:text-amber">
          <img src="/brand/glyph-inv.svg" alt="" width={28} height={28} aria-hidden="true" />
          <span>{SITE.name}</span>
        </Link>
        {/* min-h-6 on each link: 14px type at this line-height drew a 20px-tall
            box, and SC 2.5.8's inline-text exemption does not reach a standalone
            nav link. The row is already items-center, so nothing shifts. */}
        <nav aria-label="primary" className="flex items-center gap-x-5 font-house-mono text-sm">
          <Link href="/" prefetch={false} className="inline-flex min-h-6 items-center hover:text-amber">
            tool
          </Link>
          <Link href="/docs" prefetch={false} className="inline-flex min-h-6 items-center hover:text-amber">
            docs
          </Link>
          <a href={SITE.repoUrl} className="inline-flex min-h-6 items-center hover:text-amber">
            repo ↗
          </a>
        </nav>
      </div>
    </header>
  );
}
