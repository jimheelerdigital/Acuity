"use client";

import Link from "next/link";

import { Skeleton } from "@/components/skeleton";

/**
 * Sticky right-rail goal detail. Renders at 2xl: only — at narrower
 * widths the parent decides not to mount this at all. The rail
 * surfaces context that would otherwise require a navigation to
 * /goals/[id]: full description, all child tasks, progress notes log,
 * last-mentioned timestamp, and the most-recent source entry that
 * referenced the goal.
 *
 * The parent owns the cache. This component is a presentation layer
 * over a (detail | loading | empty) state.
 */

export type GoalRailDetail = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  lifeArea: string;
  manualProgress: number;
  calculatedProgress: number;
  lastMentionedAt: string | null;
  /** Child tasks attached directly to this goal — full list, no truncation. */
  tasks: Array<{
    id: string;
    title: string | null;
    text: string | null;
    status: string;
    priority: string;
  }>;
  /** Newest-first progress notes (Json[] on the Goal model — already
   *  parsed by the API). */
  progressNotes: Array<{
    note?: string;
    text?: string;
    createdAt?: string;
  }>;
  /** Most recent linked entry, if any — see /api/goals/[id] for the
   *  union of Entry.goalId + Goal.entryRefs. */
  sourceEntry?: {
    id: string;
    summary: string | null;
    createdAt: string;
  } | null;
};

const STATUS_LABEL: Record<string, string> = {
  NOT_STARTED: "Not started",
  IN_PROGRESS: "In progress",
  ON_HOLD: "On hold",
  COMPLETE: "Complete",
  ARCHIVED: "Archived",
};

const AREA_LABEL: Record<string, string> = {
  CAREER: "Career",
  HEALTH: "Health",
  RELATIONSHIPS: "Relationships",
  FINANCES: "Finances",
  PERSONAL: "Personal Growth",
  OTHER: "Other",
};

function formatRelative(iso: string | null | undefined): string {
  if (!iso) return "—";
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "—";
  const diffMs = Date.now() - then;
  const diffDays = Math.round(diffMs / 86_400_000);
  if (diffDays === 0) return "today";
  if (diffDays === 1) return "yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.round(diffDays / 7)} weeks ago`;
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function GoalDetailRail({
  detail,
  loading,
}: {
  detail: GoalRailDetail | null;
  loading: boolean;
}) {
  if (loading) return <GoalDetailRailSkeleton />;

  // Empty-state fallback: a goal with literally no detail to show
  // (no description, no tasks, no notes, no linked entry) is rare but
  // possible right after extraction creates the row. Render a one-line
  // message instead of a hollow rail.
  const hasAny =
    !!detail &&
    (!!detail.description ||
      detail.tasks.length > 0 ||
      detail.progressNotes.length > 0 ||
      !!detail.sourceEntry);

  if (!detail || !hasAny) {
    return (
      <aside className="rounded-2xl border border-zinc-200 bg-white p-6 text-sm text-zinc-500 dark:border-white/10 dark:bg-[#1E1E2E] dark:text-zinc-400">
        Pick a goal on the left for full context.
      </aside>
    );
  }

  return (
    <aside className="flex flex-col gap-5 rounded-2xl border border-zinc-200 bg-white p-6 dark:border-white/10 dark:bg-[#1E1E2E]">
      {/* Header — title + meta row */}
      <header>
        <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">
          Goal detail
        </p>
        <h2 className="mt-1 text-lg font-semibold leading-snug text-zinc-900 dark:text-zinc-50">
          {detail.title}
        </h2>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-zinc-500 dark:text-zinc-400">
          <span>{STATUS_LABEL[detail.status] ?? detail.status}</span>
          <span aria-hidden="true">·</span>
          <span>{AREA_LABEL[detail.lifeArea] ?? detail.lifeArea}</span>
          <span aria-hidden="true">·</span>
          <span>Last mentioned {formatRelative(detail.lastMentionedAt)}</span>
        </div>

        {/* Progress bar */}
        <div className="mt-3 flex items-center gap-3">
          <div className="h-1.5 flex-1 rounded-full bg-zinc-100 dark:bg-white/10">
            <div
              className="h-1.5 rounded-full bg-violet-500 transition-all duration-500"
              style={{ width: `${detail.calculatedProgress}%` }}
            />
          </div>
          <span className="text-xs font-semibold tabular-nums text-zinc-700 dark:text-zinc-200">
            {detail.calculatedProgress}%
          </span>
        </div>
      </header>

      {/* Description — full text, no truncation */}
      {detail.description && (
        <section>
          <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">
            Description
          </p>
          <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-zinc-700 dark:text-zinc-200">
            {detail.description}
          </p>
        </section>
      )}

      {/* Child tasks — full list, no truncation */}
      {detail.tasks.length > 0 && (
        <section>
          <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">
            Tasks ({detail.tasks.length})
          </p>
          <ul className="mt-2 space-y-1.5">
            {detail.tasks.map((t) => {
              const done = t.status === "DONE" || t.status === "COMPLETE";
              return (
                <li
                  key={t.id}
                  className="flex items-start gap-2 text-sm leading-snug"
                >
                  <span
                    aria-hidden="true"
                    className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${
                      done ? "bg-zinc-300 dark:bg-zinc-600" : "bg-violet-500"
                    }`}
                  />
                  <span
                    className={
                      done
                        ? "text-zinc-400 line-through dark:text-zinc-500"
                        : "text-zinc-700 dark:text-zinc-200"
                    }
                  >
                    {t.title ?? t.text ?? "Untitled task"}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* Progress notes log — newest first */}
      {detail.progressNotes.length > 0 && (
        <section>
          <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">
            Progress notes
          </p>
          <ul className="mt-2 space-y-2">
            {detail.progressNotes.map((n, i) => {
              const text = n.note ?? n.text ?? "";
              if (!text) return null;
              return (
                <li
                  key={i}
                  className="rounded-lg border border-zinc-100 bg-zinc-50/60 p-3 text-xs leading-relaxed text-zinc-600 dark:border-white/[0.06] dark:bg-white/[0.02] dark:text-zinc-300"
                >
                  <p className="whitespace-pre-line">{text}</p>
                  {n.createdAt && (
                    <p className="mt-1.5 text-[10px] uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                      {formatRelative(n.createdAt)}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* Source entry — most recent linked debrief */}
      {detail.sourceEntry && (
        <section>
          <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">
            From your debrief
          </p>
          <Link
            href={`/entries/${detail.sourceEntry.id}`}
            className="mt-2 block rounded-lg border-l-2 border-violet-500 bg-zinc-50/60 px-3 py-2 transition hover:bg-zinc-100/60 dark:bg-white/[0.02] dark:hover:bg-white/[0.04]"
          >
            <p className="line-clamp-3 text-sm leading-relaxed text-zinc-700 dark:text-zinc-200">
              {detail.sourceEntry.summary ?? "(no summary)"}
            </p>
            <p className="mt-1.5 text-[10px] uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
              {formatRelative(detail.sourceEntry.createdAt)}
            </p>
          </Link>
        </section>
      )}

      {/* Open-detail link as a fallback path. Useful if rail content
          is enough to scan but the user wants to edit. */}
      <footer className="border-t border-zinc-100 pt-4 dark:border-white/5">
        <Link
          href={`/goals/${detail.id}`}
          className="text-sm font-semibold text-violet-600 hover:text-violet-500 dark:text-violet-400"
        >
          Open full detail →
        </Link>
      </footer>
    </aside>
  );
}

function GoalDetailRailSkeleton() {
  return (
    <aside
      aria-hidden="true"
      className="flex flex-col gap-5 rounded-2xl border border-zinc-200 bg-white p-6 dark:border-white/10 dark:bg-[#1E1E2E]"
    >
      <div>
        <Skeleton className="h-3 w-20" />
        <Skeleton className="mt-2 h-5 w-3/4" />
        <Skeleton className="mt-2 h-3 w-1/2" />
        <Skeleton className="mt-3 h-1.5 w-full rounded-full" />
      </div>
      <div>
        <Skeleton className="h-3 w-24" />
        <Skeleton className="mt-2 h-4 w-full" />
        <Skeleton className="mt-1.5 h-4 w-5/6" />
      </div>
      <div>
        <Skeleton className="h-3 w-16" />
        <Skeleton className="mt-2 h-4 w-3/4" />
        <Skeleton className="mt-1.5 h-4 w-2/3" />
        <Skeleton className="mt-1.5 h-4 w-1/2" />
      </div>
    </aside>
  );
}
