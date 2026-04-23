"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { formatRelativeDate } from "@acuity/shared";

type Suggestion = {
  id: string;
  goalId: string;
  goalTitle: string | null;
  currentProgressPct: number;
  priorProgressPct: number;
  suggestedProgressPct: number;
  rationale: string;
  sourceEntryId: string | null;
  sourceEntrySummary: string | null;
  sourceEntryAt: string | null;
  createdAt: string;
};

/**
 * Progress-update review banner on the goal detail page. Fetches
 * PENDING ProgressSuggestion rows for this goal, renders each with
 * accept / edit / dismiss controls. On accept, the goal's progress
 * updates on the page (parent server component's data is refreshed
 * via router.refresh()). On dismiss, the suggestion disappears and
 * nothing writes to the goal.
 */
export function ProgressSuggestionBanner({
  goalId,
  onProgressUpdated,
}: {
  goalId: string;
  /** Called after a successful accept so the parent can update the
   *  on-screen progress slider + trigger router.refresh(). */
  onProgressUpdated: (newProgressPct: number) => void;
}) {
  const [loading, setLoading] = useState(true);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<number>(0);
  const [actingId, setActingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/goals/progress-suggestions?goalId=${encodeURIComponent(goalId)}`
        );
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as { suggestions: Suggestion[] };
        if (!cancelled) setSuggestions(data.suggestions ?? []);
      } catch {
        // silent — banner just doesn't render
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [goalId]);

  const remove = (id: string) =>
    setSuggestions((prev) => prev.filter((s) => s.id !== id));

  const accept = async (s: Suggestion, editedPct?: number) => {
    setActingId(s.id);
    try {
      const res = await fetch("/api/goals/progress-suggestions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          editedPct != null
            ? { action: "edit-accept", id: s.id, editedPct }
            : { action: "accept", id: s.id }
        ),
      });
      if (res.ok) {
        const data = (await res.json()) as { goalProgress: number };
        onProgressUpdated(data.goalProgress);
        remove(s.id);
      }
    } finally {
      setActingId(null);
      setEditingId(null);
    }
  };

  const dismiss = async (s: Suggestion) => {
    setActingId(s.id);
    try {
      const res = await fetch("/api/goals/progress-suggestions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "dismiss", id: s.id }),
      });
      if (res.ok) remove(s.id);
    } finally {
      setActingId(null);
    }
  };

  if (loading || suggestions.length === 0) return null;

  return (
    <section className="rounded-2xl border border-violet-200 dark:border-violet-900/30 bg-violet-50/60 dark:bg-violet-950/20 p-5">
      <p className="text-xs font-semibold uppercase tracking-widest text-violet-700 dark:text-violet-300">
        Acuity noticed progress
      </p>
      <div className="mt-3 space-y-4">
        {suggestions.map((s) => {
          const isEditing = editingId === s.id;
          const acting = actingId === s.id;
          const delta = s.suggestedProgressPct - s.currentProgressPct;
          return (
            <div
              key={s.id}
              className="rounded-xl border border-violet-200 dark:border-white/10 bg-white dark:bg-[#1E1E2E] p-4"
            >
              <p className="text-sm leading-relaxed text-zinc-700 dark:text-zinc-200">
                {s.rationale}
              </p>
              {s.sourceEntryId && (
                <p className="mt-1.5 text-xs text-zinc-500 dark:text-zinc-400">
                  From{" "}
                  <Link
                    href={`/entries/${s.sourceEntryId}`}
                    className="text-violet-600 dark:text-violet-400 hover:underline"
                  >
                    {s.sourceEntryAt
                      ? `your ${formatRelativeDate(s.sourceEntryAt)} entry`
                      : "your entry"}
                  </Link>
                </p>
              )}
              <div className="mt-3 flex items-baseline gap-2 text-sm">
                <span className="text-zinc-500 dark:text-zinc-400">
                  {s.currentProgressPct}%
                </span>
                <span className="text-zinc-400">→</span>
                {isEditing ? (
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={editDraft}
                    onChange={(e) => setEditDraft(Number(e.target.value))}
                    className="w-16 rounded-md border border-zinc-300 dark:border-white/15 bg-white dark:bg-[#13131F] px-2 py-1 text-sm text-zinc-900 dark:text-zinc-50 outline-none focus:border-violet-500"
                    autoFocus
                  />
                ) : (
                  <span className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
                    {s.suggestedProgressPct}%
                  </span>
                )}
                {!isEditing && delta !== 0 && (
                  <span
                    className={`text-xs font-medium ${delta > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}`}
                  >
                    {delta > 0 ? `+${delta}` : delta}
                  </span>
                )}
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {isEditing ? (
                  <>
                    <button
                      disabled={acting}
                      onClick={() => accept(s, editDraft)}
                      className="rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-500 disabled:opacity-40"
                    >
                      Save {editDraft}%
                    </button>
                    <button
                      disabled={acting}
                      onClick={() => setEditingId(null)}
                      className="rounded-lg px-3 py-1.5 text-xs font-medium text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-white/5"
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      disabled={acting}
                      onClick={() => accept(s)}
                      className="rounded-lg bg-zinc-900 dark:bg-white dark:text-zinc-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-zinc-700 dark:hover:bg-zinc-200 disabled:opacity-40"
                    >
                      Accept {s.suggestedProgressPct}%
                    </button>
                    <button
                      disabled={acting}
                      onClick={() => {
                        setEditDraft(s.suggestedProgressPct);
                        setEditingId(s.id);
                      }}
                      className="rounded-lg border border-zinc-200 dark:border-white/10 px-3 py-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-white/5 disabled:opacity-40"
                    >
                      Edit
                    </button>
                    <button
                      disabled={acting}
                      onClick={() => dismiss(s)}
                      className="rounded-lg px-3 py-1.5 text-xs font-medium text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-white/5 disabled:opacity-40"
                    >
                      Dismiss
                    </button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
