"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { PRIORITY_LABELS } from "@acuity/shared";

type ReviewTask = {
  tempId: string;
  title: string;
  description: string | null;
  priority: string;
  dueDate: string | null;
  groupName: string | null;
};
type ReviewGoal = {
  tempId: string;
  title: string;
  description: string | null;
  targetDate: string | null;
  lifeArea: string | null;
  alreadyExists: boolean;
};

/**
 * Review banner on the entry detail page. Surfaces the tasks + goals
 * Acuity extracted from the recording and lets the user tick what to
 * commit.
 *
 * Default state (2026-05-25): everything starts UNCHECKED. Mobile
 * has shipped this way for a while; web had been defaulting tasks to
 * checked + new-goals to checked, which let users hit Commit without
 * reviewing and accept low-quality extractions by accident. Forcing
 * the affirmative tick treats Commit as a "yes to these" rather than
 * a "yes to defaults".
 *
 * Commit with zero ticked items opens a small inline confirm: the
 * user can Discard (calls skip()) or Cancel back to the picker.
 *
 * On Commit: POST /api/entries/[id]/extraction with {action:"commit",
 * tasks, goals}. Server creates rows + sets extractionCommittedAt.
 * On Skip all: same endpoint with {action:"skip"} — marks reviewed
 * with zero commits.
 */
// Issue B (v1.3.3) analytics — fire-and-forget review-gate events.
function fireReviewEvent(event: string, entryId: string): void {
  void fetch("/api/onboarding-events", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ event, value: entryId }),
  }).catch(() => {});
}

export function ExtractionReview({ entryId }: { entryId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [tasks, setTasks] = useState<(ReviewTask & { selected: boolean })[]>([]);
  const [goals, setGoals] = useState<(ReviewGoal & { selected: boolean })[]>([]);
  const [hidden, setHidden] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/entries/${encodeURIComponent(entryId)}/extraction`
        );
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as {
          committedAt: string | null;
          tasks: ReviewTask[];
          goals: ReviewGoal[];
        };
        if (cancelled) return;
        if (data.committedAt) {
          setHidden(true);
          return;
        }
        // 2026-05-25: default UNCHECKED for everything so the user has
        // to affirmatively tick what to keep. Matches mobile behavior.
        setTasks(data.tasks.map((t) => ({ ...t, selected: false })));
        setGoals(data.goals.map((g) => ({ ...g, selected: false })));
        if (data.tasks.length > 0 || data.goals.length > 0) {
          fireReviewEvent("review_gate_shown", entryId);
        }
      } catch {
        // silent — banner just doesn't render if the endpoint fails
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [entryId]);

  if (loading || hidden) return null;
  if (tasks.length === 0 && goals.length === 0) return null;

  const commit = async () => {
    setError(null);
    // Empty-state guard: if the user hits Commit with nothing ticked
    // we don't silently send a no-op. Show an inline confirmation so
    // they can either Discard explicitly or go back and tick items.
    const totalSelected =
      tasks.filter((t) => t.selected).length +
      goals.filter((g) => g.selected).length;
    if (totalSelected === 0) {
      setConfirmDiscard(true);
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(
        `/api/entries/${encodeURIComponent(entryId)}/extraction`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "commit",
            tasks: tasks
              .filter((t) => t.selected)
              .map((t) => ({
                title: t.title,
                description: t.description,
                priority: t.priority,
                dueDate: t.dueDate,
                groupName: t.groupName,
              })),
            goals: goals
              .filter((g) => g.selected)
              .map((g) => ({
                title: g.title,
                description: g.description,
                targetDate: g.targetDate,
                lifeArea: g.lifeArea,
              })),
          }),
        }
      );
      if (res.ok) {
        fireReviewEvent("review_gate_confirmed", entryId);
        setHidden(true);
        router.refresh();
        return;
      }
      const body = await res.json().catch(() => ({}));
      setError(
        typeof body?.error === "string"
          ? body.error
          : `Commit failed (status ${res.status}).`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Commit failed.");
    } finally {
      setSubmitting(false);
    }
  };

  const skip = async () => {
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch(
        `/api/entries/${encodeURIComponent(entryId)}/extraction`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "skip" }),
        }
      );
      if (res.ok) {
        fireReviewEvent("review_gate_dismissed", entryId);
        setHidden(true);
        router.refresh();
        return;
      }
      const body = await res.json().catch(() => ({}));
      setError(
        typeof body?.error === "string"
          ? body.error
          : `Skip failed (status ${res.status}).`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Skip failed.");
    } finally {
      setSubmitting(false);
    }
  };

  const selectedTasks = tasks.filter((t) => t.selected).length;
  const selectedGoals = goals.filter((g) => g.selected).length;

  return (
    <section className="rounded-2xl border border-acuity-primary-soft dark:border-acuity-primary-soft bg-gradient-to-br from-acuity-primary-soft to-white dark:from-acuity-primary-soft dark:to-acuity-card-bg p-5 mb-8">
      <div className="mb-4">
        <p className="text-xs font-semibold uppercase tracking-widest text-acuity-primary dark:text-acuity-primary">
          Review what Acuity extracted
        </p>
        <p className="mt-1.5 text-sm text-zinc-600 dark:text-zinc-300">
          Tick what to keep, then commit. Items you don&rsquo;t select are
          discarded.
        </p>
      </div>

      {tasks.length > 0 && (
        <div className="mb-5">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
            Tasks Acuity extracted ({tasks.length})
          </h3>
          <div className="space-y-2">
            {tasks.map((t) => (
              <ReviewRow
                key={t.tempId}
                selected={t.selected}
                onToggle={() =>
                  setTasks((prev) =>
                    prev.map((x) =>
                      x.tempId === t.tempId ? { ...x, selected: !x.selected } : x
                    )
                  )
                }
                title={t.title}
                onTitleChange={(v) =>
                  setTasks((prev) =>
                    prev.map((x) =>
                      x.tempId === t.tempId ? { ...x, title: v } : x
                    )
                  )
                }
                chips={[
                  PRIORITY_LABELS[t.priority] ?? t.priority,
                  ...(t.groupName ? [t.groupName] : []),
                ]}
                subline={t.description ?? undefined}
              />
            ))}
          </div>
        </div>
      )}

      {goals.length > 0 && (
        <div className="mb-5">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
            Goals Acuity suggested ({goals.length})
          </h3>
          <div className="space-y-2">
            {goals.map((g) => (
              <ReviewRow
                key={g.tempId}
                selected={g.selected}
                onToggle={() =>
                  setGoals((prev) =>
                    prev.map((x) =>
                      x.tempId === g.tempId ? { ...x, selected: !x.selected } : x
                    )
                  )
                }
                title={g.title}
                onTitleChange={(v) =>
                  setGoals((prev) =>
                    prev.map((x) =>
                      x.tempId === g.tempId ? { ...x, title: v } : x
                    )
                  )
                }
                chips={g.alreadyExists ? ["Already tracked"] : []}
                subline={g.description ?? undefined}
                dimmedWhen={g.alreadyExists}
              />
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 pt-2">
        <button
          type="button"
          disabled={submitting}
          onClick={commit}
          className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-zinc-700 disabled:opacity-50 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          Commit {selectedTasks + selectedGoals > 0
            ? `(${selectedTasks} task${selectedTasks === 1 ? "" : "s"}, ${selectedGoals} goal${selectedGoals === 1 ? "" : "s"})`
            : ""}
        </button>
        <button
          type="button"
          disabled={submitting}
          onClick={skip}
          className="text-sm font-medium text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200 disabled:opacity-50"
        >
          Skip all
        </button>
      </div>

      {confirmDiscard && (
        <div
          role="alertdialog"
          className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-zinc-200 dark:border-white/10 bg-white dark:bg-acuity-card-bg px-3 py-2"
        >
          <span className="text-sm text-zinc-600 dark:text-zinc-300">
            Nothing selected. Discard the extraction?
          </span>
          <button
            type="button"
            disabled={submitting}
            onClick={() => {
              setConfirmDiscard(false);
              void skip();
            }}
            className="rounded-acuity-pill px-3 py-1 text-xs font-semibold"
            style={{ color: "var(--acuity-warn)" }}
          >
            Discard
          </button>
          <button
            type="button"
            disabled={submitting}
            onClick={() => setConfirmDiscard(false)}
            className="rounded-acuity-pill px-3 py-1 text-xs font-medium text-zinc-500 dark:text-zinc-400"
          >
            Cancel
          </button>
        </div>
      )}

      {error && (
        <p
          role="alert"
          className="mt-3 rounded-lg border border-red-200 dark:border-red-900/40 bg-red-50 dark:bg-red-950/20 px-3 py-2 text-xs text-red-700 dark:text-red-300"
        >
          {error}
        </p>
      )}
    </section>
  );
}

function ReviewRow({
  selected,
  onToggle,
  title,
  onTitleChange,
  chips,
  subline,
  dimmedWhen,
}: {
  selected: boolean;
  onToggle: () => void;
  title: string;
  onTitleChange: (v: string) => void;
  chips: string[];
  subline?: string;
  dimmedWhen?: boolean;
}) {
  return (
    <div
      className={`flex items-start gap-3 rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-acuity-card-bg px-3 py-2.5 transition ${dimmedWhen && !selected ? "opacity-60" : ""}`}
    >
      <input
        type="checkbox"
        checked={selected}
        onChange={onToggle}
        className="mt-1 h-4 w-4 shrink-0 accent-acuity-primary"
        aria-label={`Keep "${title}"`}
      />
      <div className="flex-1 min-w-0">
        <input
          type="text"
          value={title}
          onChange={(e) => onTitleChange(e.target.value)}
          className="w-full bg-transparent text-sm text-zinc-900 dark:text-zinc-50 outline-none focus:underline decoration-acuity-primary underline-offset-4"
        />
        {subline && (
          <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400 line-clamp-2">
            {subline}
          </p>
        )}
        {chips.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {chips.map((c) => (
              <span
                key={c}
                className="rounded-full bg-zinc-100 dark:bg-white/10 px-2 py-0.5 text-[10px] font-medium text-zinc-600 dark:text-zinc-300"
              >
                {c}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
