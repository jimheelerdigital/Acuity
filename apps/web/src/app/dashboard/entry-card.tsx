"use client";

import { useState } from "react";
import {
  MOOD_EMOJI,
  MOOD_LABELS,
  formatRelativeDate,
} from "@acuity/shared";
import type { Entry } from "@prisma/client";
import type { Mood } from "@acuity/shared";

type EntryCardProps = {
  entry: Pick<
    Entry,
    | "id"
    | "summary"
    | "mood"
    | "energy"
    | "themes"
    | "wins"
    | "blockers"
    | "createdAt"
    | "status"
  >;
  taskCount?: number;
};

export function EntryCard({ entry, taskCount }: EntryCardProps) {
  const [expanded, setExpanded] = useState(false);

  // Use the shared relative-date helper so "Just now / N min ago /
  // Yesterday / Mon D" stays consistent with the mobile app and the
  // /entries full-list page.
  const date = formatRelativeDate(entry.createdAt);

  const moodKey = entry.mood as Mood | null;
  const isFailed = entry.status === "FAILED";
  const isProcessing = entry.status === "PROCESSING" || entry.status === "PENDING";

  return (
    <div className="rounded-xl border border-zinc-200 bg-white overflow-hidden shadow-sm transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 dark:border-white/10 dark:bg-[#1E1E2E] dark:shadow-none dark:hover:bg-[#24243A]">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full text-left px-4 sm:px-5 py-4 flex items-start justify-between gap-3 min-h-[44px]"
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            <span className="text-xs font-medium text-zinc-400 dark:text-zinc-500">{date}</span>
            {moodKey && (
              <span className="text-xs text-zinc-500 dark:text-zinc-400">
                {MOOD_EMOJI[moodKey]} {MOOD_LABELS[moodKey]}
              </span>
            )}
            {entry.energy !== null && entry.energy !== undefined && (
              <span className="text-xs text-zinc-400 dark:text-zinc-500">
                · Energy {entry.energy}/10
              </span>
            )}
            {taskCount != null && taskCount > 0 && (
              <span className="text-xs text-zinc-400 dark:text-zinc-500">
                · {taskCount} task{taskCount === 1 ? "" : "s"}
              </span>
            )}
            {isFailed && (
              <span className="rounded-full bg-red-50 border border-red-200 px-2 py-0.5 text-xs text-red-600 dark:bg-red-950/40 dark:border-red-900/60 dark:text-red-400">
                Failed
              </span>
            )}
            {isProcessing && (
              <span className="rounded-full bg-amber-50 border border-amber-200 px-2 py-0.5 text-xs text-amber-600 dark:bg-amber-950/40 dark:border-amber-900/60 dark:text-amber-400">
                Processing...
              </span>
            )}
          </div>
          <p className="text-base sm:text-sm text-zinc-700 leading-snug line-clamp-2 dark:text-zinc-200">
            {entry.summary ?? (isProcessing ? "Processing your debrief..." : "No summary generated.")}
          </p>
          {entry.themes.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {entry.themes.map((t) => (
                <span
                  key={t}
                  className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs text-zinc-500 dark:text-zinc-400 dark:bg-white/10 dark:text-zinc-300"
                >
                  {t}
                </span>
              ))}
            </div>
          )}
        </div>
        <ChevronIcon expanded={expanded} />
      </button>

      <div
        className="overflow-hidden transition-all duration-300"
        style={{ maxHeight: expanded ? "500px" : "0" }}
      >
        <div className="border-t border-zinc-100 px-4 sm:px-5 py-4 space-y-4 dark:border-white/5">
          {entry.wins.length > 0 && (
            <div>
              <p className="text-xs font-medium text-emerald-600 mb-1.5 dark:text-emerald-400">Wins</p>
              <ul className="space-y-1">
                {entry.wins.map((w, i) => (
                  <li key={i} className="text-sm text-zinc-600 flex gap-2 dark:text-zinc-300">
                    <span className="text-emerald-500 shrink-0">✓</span>
                    {w}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {entry.blockers.length > 0 && (
            <div>
              <p className="text-xs font-medium text-red-500 mb-1.5 dark:text-red-400">
                Blockers
              </p>
              <ul className="space-y-1">
                {entry.blockers.map((b, i) => (
                  <li key={i} className="text-sm text-zinc-600 flex gap-2 dark:text-zinc-300">
                    <span className="text-red-400 shrink-0">↳</span>
                    {b}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ChevronIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`shrink-0 text-zinc-400 dark:text-zinc-500 transition-transform duration-300 ${expanded ? "rotate-180" : ""}`}
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}
