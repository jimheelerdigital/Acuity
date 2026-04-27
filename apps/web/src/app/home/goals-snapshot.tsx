import Link from "next/link";

/**
 * Compact goals card — sits below WeeklyInsightCard on /home so the
 * right column matches the height of the LifeMatrixSnapshot card on
 * the left. Top 3 goals (IN_PROGRESS first, then NOT_STARTED) with
 * progress bars; links through to /goals.
 *
 * Empty state: no goals → friendly "extracted from your debriefs"
 * copy with a CTA into /goals (which has the same empty state with
 * a longer-form explanation).
 *
 * Server component — caller passes pre-fetched rows. Caps at 3 to
 * keep the visual budget in check.
 */

export type SnapshotGoal = {
  id: string;
  title: string;
  status: string; // NOT_STARTED | IN_PROGRESS | ON_HOLD | COMPLETE | ARCHIVED
  progress: number; // 0-100
  lifeArea: string;
};

export function GoalsSnapshotCard({
  goals,
  className,
}: {
  goals: SnapshotGoal[];
  /**
   * Optional layout passthrough. /home applies `flex-1` so this card
   * stretches to fill the right column when the LifeMatrixSnapshot
   * on the left is taller than WeeklyInsightCard + Goals stacked.
   */
  className?: string;
}) {
  return (
    <section
      className={`rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-[#1E1E2E] ${
        className ?? ""
      }`}
    >
      <h2 className="text-xs font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">
        Goals
      </h2>

      {goals.length === 0 ? (
        <p className="mt-4 text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">
          Goals show up here as Acuity hears commitments in your debriefs.
          Mention something you want to do and it&rsquo;ll appear for you
          to accept.
        </p>
      ) : (
        <ul className="mt-4 space-y-3">
          {goals.map((g) => {
            const progress = Math.max(0, Math.min(100, g.progress));
            return (
              <li key={g.id}>
                <div className="flex items-baseline justify-between gap-3">
                  <p className="flex-1 truncate text-sm font-medium text-zinc-800 dark:text-zinc-100">
                    {g.title}
                  </p>
                  <span className="shrink-0 text-xs font-medium tabular-nums text-zinc-500 dark:text-zinc-400">
                    {progress}%
                  </span>
                </div>
                <div className="mt-1.5 h-1.5 rounded-full bg-zinc-100 dark:bg-white/10">
                  <div
                    className="h-1.5 rounded-full bg-violet-500"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-5 border-t border-zinc-100 pt-4 dark:border-white/5">
        <Link
          href="/goals"
          className="inline-flex items-center gap-1 text-sm font-semibold text-violet-600 transition hover:text-violet-500 dark:text-violet-400"
        >
          {goals.length === 0 ? "Open Goals" : "See all goals"}
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <path d="M9 18l6-6-6-6" />
          </svg>
        </Link>
      </div>
    </section>
  );
}
