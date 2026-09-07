import Link from "next/link";

import { SITE } from "@/lib/site";
import { Attribution } from "./Attribution";

/**
 * BRAND-KIT requirement #3: on EVERY page — chip mark + "Built by James
 * Lorenz Santos" + link to the portfolio + link to the repo. No hire-me CTA
 * (PROGRAM.md D1) — this is identity, not advertising.
 *
 * The maker line is the shared attribution kit (attribution-kit v1): the chip mark
 * inline in currentColor, the portfolio and LinkedIn links with rel="me".
 * One system across every project, so it is verified rather than remembered.
 */
export function Footer(): React.JSX.Element {
  return (
    <footer className="mt-16 border-t border-rule">
      <div className="mx-auto max-w-5xl flex flex-col gap-4 px-6 py-8 text-sm text-ink/70 sm:flex-row sm:items-center sm:justify-between">
        <Attribution linkClassName="text-ink underline decoration-rule hover:text-amber" />
        {/* min-h-6 per link, same reason as the header: these are standalone
            targets in a nav, not links inside a sentence, so SC 2.5.8's inline
            exemption does not apply to them. */}
        <nav aria-label="clarifier site links" className="flex flex-wrap items-center gap-x-5 gap-y-2 font-house-mono">
          <Link href="/" prefetch={false} className="inline-flex min-h-6 items-center hover:text-amber">
            clarifier
          </Link>
          <Link href="/docs" prefetch={false} className="inline-flex min-h-6 items-center hover:text-amber">
            docs
          </Link>
          <Link href="/docs/quickstart" prefetch={false} className="inline-flex min-h-6 items-center hover:text-amber">
            quickstart
          </Link>
          <Link href="/docs/concept" prefetch={false} className="inline-flex min-h-6 items-center hover:text-amber">
            concept
          </Link>
          <Link href="/docs/failure-modes" prefetch={false} className="inline-flex min-h-6 items-center hover:text-amber">
            failure modes
          </Link>
          <Link href="/docs/limitations" prefetch={false} className="inline-flex min-h-6 items-center hover:text-amber">
            limitations
          </Link>
          <a href={SITE.repoUrl} className="inline-flex min-h-6 items-center hover:text-amber">
            repo ↗
          </a>
        </nav>
      </div>
    </footer>
  );
}
