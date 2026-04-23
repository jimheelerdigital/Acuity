"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { type EntryDTO } from "@acuity/shared";

import { MoodIcon } from "@/components/mood-icon";

/**
 * Horizontally-scrolling "Recent activity" strip for the Insights page.
 * Shows up to 12 entries from the last 7 days with mood emoji, date,
 * and the first ~120 chars of the entry's AI summary (falls back to
 * the transcript slice when the summary hasn't been generated yet).
 * Hidden entirely when the user has fewer than 3 recent entries —
 * nothing to show, no empty state.
 */
export function RecentTimeline() {
  const [entries, setEntries] = useState<EntryDTO[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/entries");
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setEntries(data.entries ?? []);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) return null;

  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const recent = entries
    .filter((e) => new Date(e.createdAt).getTime() >= sevenDaysAgo)
    .slice(0, 12);

  if (recent.length < 3) return null;

  return (
    <section className="mb-8">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
          Recent activity
        </h2>
        <Link
          href="/entries"
          className="text-xs text-violet-600 dark:text-violet-400 hover:underline"
        >
          View all →
        </Link>
      </div>
      <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1 scrollbar-hide">
        {recent.map((entry) => {
          const summary =
            entry.summary ??
            (entry.transcript
              ? entry.transcript.slice(0, 120) +
                (entry.transcript.length > 120 ? "…" : "")
              : "No summary available.");
          const when = new Date(entry.createdAt);
          const day = when.toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
          });
          const time = when.toLocaleTimeString("en-US", {
            hour: "numeric",
            minute: "2-digit",
          });
          return (
            <Link
              key={entry.id}
              href="/entries"
              className="shrink-0 w-64 rounded-2xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#1E1E2E] p-3 transition hover:border-violet-300 dark:hover:border-violet-700/40 hover:shadow-sm"
            >
              <div className="flex items-center gap-2 mb-2">
                <MoodIcon
                  mood={entry.mood ?? "NEUTRAL"}
                  size={16}
                  className="text-zinc-500 dark:text-zinc-400"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-zinc-600 dark:text-zinc-300">
                    {day}
                  </p>
                  <p className="text-[10px] text-zinc-400 dark:text-zinc-500">
                    {time}
                  </p>
                </div>
              </div>
              <p className="text-xs text-zinc-600 dark:text-zinc-300 leading-snug line-clamp-4">
                {summary}
              </p>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
