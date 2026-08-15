import Link from "next/link";

import { SITE } from "@/lib/site";

/**
 * BRAND-KIT requirement #3: on EVERY page — chip mark + "Built by James
 * Lorenz Santos" + link to the portfolio + link to the repo. No hire-me CTA
 * (PROGRAM.md D1) — this is identity, not advertising.
 */
export function Footer(): React.JSX.Element {
  return (
    <footer className="mt-16 border-t border-rule">
      <div className="mx-auto flex max-w-5xl flex-col gap-4 px-6 py-8 text-sm text-ink/70 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <img src="/brand/mark-16.svg" alt="" width={20} height={20} aria-hidden="true" />
          <span>
            Built by{" "}
            <a href={SITE.portfolioUrl} className="text-ink underline decoration-rule hover:text-amber">
              {SITE.authorName}
            </a>
          </span>
        </div>
        <nav aria-label="clarifier site links" className="flex flex-wrap items-center gap-x-5 gap-y-2 font-house-mono">
          <Link href="/" prefetch={false} className="hover:text-amber">
            clarifier
          </Link>
          <Link href="/docs" prefetch={false} className="hover:text-amber">
            docs
          </Link>
          <Link href="/docs/quickstart" prefetch={false} className="hover:text-amber">
            quickstart
          </Link>
          <Link href="/docs/concept" prefetch={false} className="hover:text-amber">
            concept
          </Link>
          <Link href="/docs/failure-modes" prefetch={false} className="hover:text-amber">
            failure modes
          </Link>
          <Link href="/docs/limitations" prefetch={false} className="hover:text-amber">
            limitations
          </Link>
          <a href={SITE.repoUrl} className="hover:text-amber">
            repo ↗
          </a>
          <a href={SITE.portfolioUrl} className="hover:text-amber">
            agentjames.vercel.app ↗
          </a>
        </nav>
      </div>
    </footer>
  );
}
