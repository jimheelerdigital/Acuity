"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { MOOD_LABELS } from "@acuity/shared";
import type { Mood } from "@acuity/shared";

import { EntryCard } from "@/app/home/entry-card";
import { MoodIcon } from "@/components/mood-icon";

type EntryRow = Parameters<typeof EntryCard>[0]["entry"] & {
  createdAt: Date;
  transcript: string | null;
};

const MOOD_OPTIONS: (Mood | "ALL")[] = [
  "ALL",
  "GREAT",
  "GOOD",
  "NEUTRAL",
  "LOW",
  "ROUGH",
];

export function EntriesList({
  entries,
  taskCounts,
}: {
  entries: EntryRow[];
  taskCounts: Record<string, number>;
}) {
  const [query, setQuery] = useState("");
  const [moodFilter, setMoodFilter] = useState<Mood | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return entries.filter((e) => {
      if (moodFilter && e.mood !== moodFilter) return false;
      if (!q) return true;
      const haystack = [
        e.summary ?? "",
        (e.themes ?? []).join(" "),
        e.transcript ?? "",
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [entries, query, moodFilter]);

  const showingFiltered =
    query.trim().length > 0 || moodFilter !== null;

  return (
    <>
      <div className="mb-5 space-y-3">
        <div className="flex items-center gap-2 rounded-2xl border border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-[#1E1E2E] px-3 py-2">
          <SearchIcon />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search summaries, themes, transcripts"
            className="flex-1 bg-transparent text-sm text-zinc-900 dark:text-zinc-50 placeholder:text-zinc-500 outline-none"
            type="search"
          />
          {query.length > 0 && (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="rounded-full p-0.5 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
              aria-label="Clear search"
            >
              <CloseIcon />
            </button>
          )}
        </div>

        <div className="flex flex-wrap gap-1.5">
          {MOOD_OPTIONS.map((m) => {
            const selected =
              (m === "ALL" && moodFilter === null) || m === moodFilter;
            return (
              <button
                key={m}
                type="button"
                onClick={() => setMoodFilter(m === "ALL" ? null : (m as Mood))}
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 border text-xs font-medium transition ${
                  selected
                    ? "border-violet-500 bg-violet-500/10 text-violet-700 dark:border-violet-400 dark:bg-violet-500/20 dark:text-violet-300"
                    : "border-zinc-200 text-zinc-500 hover:border-zinc-300 dark:border-white/10 dark:text-zinc-400 dark:hover:border-white/20"
                }`}
              >
                {m === "ALL" ? (
                  "All"
                ) : (
                  <>
                    <MoodIcon mood={m} size={14} />
                    {MOOD_LABELS[m]}
                  </>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-300 dark:border-white/10 px-6 py-12 text-center">
          {showingFiltered ? (
            <>
              <p className="text-sm font-medium text-zinc-700 dark:text-zinc-200">
                No entries match
              </p>
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                Try a different search or clear the mood filter.
              </p>
            </>
          ) : (
            <>
              <div className="text-3xl mb-3">🎙️</div>
              <p className="text-sm font-medium text-zinc-700 dark:text-zinc-200">
                Your journal is empty
              </p>
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                Record your first brain dump from the dashboard to see it here.
              </p>
              <Link
                href="/home"
                className="mt-5 inline-block rounded-full bg-violet-600 px-5 py-2 text-sm font-semibold text-white hover:bg-violet-500"
              >
                Go to dashboard
              </Link>
            </>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((e) => (
            <EntryCard
              key={e.id}
              entry={e}
              taskCount={taskCounts[e.id] ?? 0}
            />
          ))}
        </div>
      )}
    </>
  );
}

function SearchIcon() {
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
      className="shrink-0 text-zinc-500"
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}

function CloseIcon() {
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
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" />
      <path d="m15 9-6 6" />
      <path d="m9 9 6 6" />
    </svg>
  );
}
