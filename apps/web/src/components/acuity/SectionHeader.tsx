/**
 * Acuity SectionHeader — web foundation. Slice 1.
 *
 * Per DESIGN_SYSTEM.md §3.3 eyebrow / overline rules: mono family,
 * uppercase, 10-11pt, 700 weight, 1.4 letter-spacing.
 *
 * Replaces the repeated inline pattern in the current web app:
 *   `text-xs font-semibold uppercase tracking-widest text-zinc-400`
 * which appeared in 8+ files per the parity audit. Consumers
 * migrating to this primitive get tokenized colors + the canonical
 * mono family in one swap.
 *
 * Two layouts:
 *   - default: label only, sits above the section.
 *   - with-count: label + numeric count separated by a divider middot.
 *     Used on screens that surface "Themes 4" or "Tasks 3" eyebrows.
 */

import type { HTMLAttributes, ReactNode } from "react";

export interface SectionHeaderProps extends HTMLAttributes<HTMLDivElement> {
  /** Eyebrow label text. Will be uppercased via CSS. */
  label: string;
  /** Optional numeric badge — renders as `label · count`. */
  count?: number | string;
  /** Optional trailing element (e.g., a "View all" link or filter button). */
  trailing?: ReactNode;
}

export function SectionHeader({
  label,
  count,
  trailing,
  className = "",
  ...rest
}: SectionHeaderProps) {
  return (
    <div
      className={`flex items-center justify-between gap-3 ${className}`}
      {...rest}
    >
      <span className="font-mono text-[11px] font-bold uppercase tracking-[1.4px] text-acuity-text-ter">
        {label}
        {count !== undefined && (
          <span className="ml-2 text-acuity-text-quiet">· {count}</span>
        )}
      </span>
      {trailing && <span className="shrink-0">{trailing}</span>}
    </div>
  );
}
