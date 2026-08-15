import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Docs" };

const PAGES = [
  { href: "/docs/quickstart", name: "Quickstart", desc: "Five minutes: paste a CSV, get a settled layout and a separation-gain number." },
  { href: "/docs/concept", name: "Concept", desc: "Why a force-settled layout reveals joint structure a 2-axis chart cannot, and how the claim is measured." },
  { href: "/docs/failure-modes", name: "Failure modes", desc: "Every situation the app refuses gracefully, tabulated with its exact contract." },
  { href: "/docs/limitations", name: "Limitations", desc: "What clarifier deliberately does not do, and why." },
];

export default function DocsIndexPage(): React.JSX.Element {
  return (
    <div className="mx-auto px-6 py-16">
      <div className="docs-prose">
        <h1>Documentation</h1>
        <p>clarifier is a client-only tool: paste a CSV, map columns to physical forces, watch it settle. No account, no server, nothing you paste ever leaves the browser.</p>
      </div>
      <div className="mt-8 grid max-w-3xl gap-4 sm:grid-cols-2">
        {PAGES.map((p) => (
          <Link key={p.href} href={p.href} prefetch={false} className="block rounded-[2px] border border-rule p-5 hover:border-amber">
            <div className="font-house-mono text-sm text-amber">{p.name}</div>
            <p className="mt-1.5 text-sm text-ink/75">{p.desc}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
