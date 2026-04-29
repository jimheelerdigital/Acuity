"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { MOOD_LABELS } from "@acuity/shared";
import type { Mood } from "@acuity/shared";

import { EntryCard } from "@/app/home/entry-card";
import { EntryDeleteButton } from "@/components/entry-delete-button";
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
  // Optimistic hide-on-delete. Server data refreshes via router.refresh()
  // after the DELETE returns; this set just keeps the row from showing
  // again during the round-trip.
  const [deletedIds, setDeletedIds] = useState<Set<string>>(new Set());
  const router = useRouter();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return entries.filter((e) => {
      if (deletedIds.has(e.id)) return false;
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
  }, [entries, query, moodFilter, deletedIds]);

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
        // 2xl: 2-column grid for wide-desktop. <lg / lg / xl all stay
        // single-column so reading rhythm is preserved at laptop
        // widths. space-y-0 at 2xl because gap-3 owns both axes.
        <div className="space-y-3 2xl:grid 2xl:grid-cols-2 2xl:gap-3 2xl:space-y-0">
          {filtered.map((e) => (
            <EntryRowWithMenu
              key={e.id}
              entryId={e.id}
              onDeleted={() => {
                setDeletedIds((prev) => {
                  const next = new Set(prev);
                  next.add(e.id);
                  return next;
                });
                router.refresh();
              }}
            >
              <EntryCard entry={e} taskCount={taskCounts[e.id] ?? 0} />
            </EntryRowWithMenu>
          ))}
        </div>
      )}
    </>
  );
}

/**
 * Wraps an EntryCard with a hover-revealed "..." menu in the top-right.
 * The card itself is a Link to /entries/<id> (handled by EntryCard);
 * the overlay menu absorbs its own clicks via stopPropagation so the
 * surrounding row click still navigates to the detail page.
 */
function EntryRowWithMenu({
  entryId,
  onDeleted,
  children,
}: {
  entryId: string;
  onDeleted: () => void;
  children: React.ReactNode;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <div
      className="group relative"
      onContextMenu={(e) => {
        e.preventDefault();
        setMenuOpen((v) => !v);
      }}
    >
      {children}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          setMenuOpen((v) => !v);
        }}
        aria-label="Entry options"
        className="absolute right-3 top-3 rounded-md p-1.5 text-zinc-400 opacity-0 transition group-hover:opacity-100 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-white/10 dark:hover:text-zinc-200 focus-visible:opacity-100"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="currentColor"
          aria-hidden="true"
        >
          <circle cx="5" cy="12" r="2" />
          <circle cx="12" cy="12" r="2" />
          <circle cx="19" cy="12" r="2" />
        </svg>
      </button>
      {menuOpen && (
        <>
          <div
            className="fixed inset-0 z-30"
            onClick={(e) => {
              e.stopPropagation();
              setMenuOpen(false);
            }}
          />
          <div
            className="absolute right-3 top-12 z-40 w-44 overflow-hidden rounded-md border border-zinc-200 bg-white shadow-lg dark:border-white/10 dark:bg-[#1E1E2E]"
            onClick={(e) => e.stopPropagation()}
          >
            <EntryDeleteButton
              entryId={entryId}
              variant="menu-item"
              onDeleted={() => {
                setMenuOpen(false);
                onDeleted();
              }}
            />
          </div>
        </>
      )}
    </div>
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
