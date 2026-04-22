"use client";

import { useState, type ReactNode } from "react";

/**
 * Collapsible drawer for secondary Insights content (auto-flagged
 * observations, correlations, comparisons). Default closed so the
 * above-fold is owned by Life Matrix + Timeline + link cards.
 */
export function MetricsDrawer({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <section className="mt-2">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#1E1E2E] px-4 py-3 flex items-center justify-between hover:border-zinc-300 dark:hover:border-white/20 transition"
      >
        <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
          Metrics & observations
        </span>
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          className={`text-zinc-400 transition-transform ${
            open ? "rotate-180" : ""
          }`}
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {open && <div className="mt-4">{children}</div>}
    </section>
  );
}
