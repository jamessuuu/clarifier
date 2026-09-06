"use client";

import type { ColumnMapping, ColumnRole } from "@/core/types";
import { defaultNormalizationForRole } from "@/csv/infer";
import type { ColumnStats } from "@/csv/infer";

const ROLE_OPTIONS: { value: ColumnRole; label: string }[] = [
  { value: "mass", label: "mass" },
  { value: "charge", label: "charge" },
  { value: "attraction", label: "attraction" },
  { value: "viscosity", label: "viscosity" },
  { value: "spring-anchor", label: "spring anchor" },
  { value: "label", label: "label only" },
  { value: "excluded", label: "excluded" },
];

export interface MappingPanelProps {
  mappings: ColumnMapping[];
  stats: ColumnStats[];
  onChange: (next: ColumnMapping[]) => void;
}

/**
 * SPEC.md §3: "always overridable in the UI" — every column-mapping decision
 * clarifier makes automatically is a real, focusable, labeled HTML form
 * control here, never canvas-drawn (SPEC.md §11 keyboard access). Auto
 * defaults come from src/csv/infer.ts; this component only ever mutates a
 * copy of that ColumnMapping[], never core/ or csv/ state directly.
 */
export function MappingPanel({ mappings, stats, onChange }: MappingPanelProps): React.JSX.Element {
  function setRole(index: number, role: ColumnRole): void {
    // Changing role also resets normalization to that role's default
    // (src/csv/infer.ts's defaultNormalizationForRole) — otherwise a column
    // freshly re-mapped to "attraction" would silently keep "rank" and
    // reintroduce the flattened-chain failure mode that default was chosen
    // to avoid (see the comment on defaultNormalizationForRole). A visitor
    // can still explicitly switch it back via the normalization control.
    const next = mappings.map((m, i) => (i === index ? { ...m, role, normalization: defaultNormalizationForRole(role) } : m));
    onChange(next);
  }

  function setNormalization(index: number, normalization: "rank" | "raw"): void {
    const next = mappings.map((m, i) => (i === index ? { ...m, normalization } : m));
    onChange(next);
  }

  return (
    // table-fixed + an explicit min-width, instead of the default
    // table-layout:auto: auto-layout lets column widths shift with content
    // (e.g. the role select showing "attraction" vs "excluded" is a
    // different label width), which made columns visibly jitter on
    // interaction. Fixed layout keeps column widths stable regardless of
    // which option is selected; overflow-x-auto on the wrapper still
    // carries the narrow-viewport case, unchanged, since the table can be
    // wider than the wrapper (a real, tracked-down false alarm during this
    // build: an apparent 320px page overflow chased through several CSS
    // theories turned out to be a shared local machine's e2e run reusing a
    // DIFFERENT project's dev server on the same port, not this table —
    // see e2e/smoke.spec.ts's own comment. This div's max-w-full is cheap,
    // harmless insurance kept from that investigation, not load-bearing).
    <div className="max-w-full overflow-x-auto rounded-[2px] border border-rule">
      <table className="w-full min-w-[520px] table-fixed text-left text-xs">
        <thead>
          <tr className="border-b border-rule bg-amber-soft">
            <th scope="col" className="px-3 py-2 font-house-mono font-medium">
              column
            </th>
            <th scope="col" className="px-3 py-2 font-house-mono font-medium">
              type
            </th>
            <th scope="col" className="px-3 py-2 font-house-mono font-medium">
              role
            </th>
            <th scope="col" className="px-3 py-2 font-house-mono font-medium">
              normalization
            </th>
            <th scope="col" className="px-3 py-2 font-house-mono font-medium">
              missing
            </th>
          </tr>
        </thead>
        <tbody>
          {mappings.map((m, i) => {
            const stat = stats[i];
            const isNumeric = m.inferredType === "numeric";
            const roleSelectId = `role-${String(i)}`;
            const normSelectId = `norm-${String(i)}`;
            return (
              <tr key={m.name} className="border-b border-rule last:border-b-0">
                <td className="px-3 py-2 font-house-mono">{m.name}</td>
                <td className="px-3 py-2 text-ink/70">{m.inferredType}</td>
                <td className="px-3 py-2">
                  <label htmlFor={roleSelectId} className="sr-only">
                    Force role for column {m.name}
                  </label>
                  <select id={roleSelectId} className="rounded-[2px] border border-rule-strong bg-paper px-1.5 py-1" value={m.role} onChange={(e) => setRole(i, e.target.value as ColumnRole)}>
                    {ROLE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-3 py-2">
                  {isNumeric ? (
                    <>
                      <label htmlFor={normSelectId} className="sr-only">
                        Normalization for column {m.name}
                      </label>
                      <select
                        id={normSelectId}
                        className="rounded-[2px] border border-rule-strong bg-paper px-1.5 py-1"
                        value={m.normalization}
                        onChange={(e) => setNormalization(i, e.target.value as "rank" | "raw")}
                      >
                        <option value="rank">rank (default)</option>
                        <option value="raw">raw</option>
                      </select>
                      {m.normalization === "raw" && <span className="ml-2 text-amber">exaggerates outliers</span>}
                    </>
                  ) : (
                    <span className="text-ink/40">—</span>
                  )}
                </td>
                <td className="px-3 py-2 text-ink/70">{stat ? `${String(stat.missingCount)} of ${String(stat.missingCount + stat.nonNullCount)}` : "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
