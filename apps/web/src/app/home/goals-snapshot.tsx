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
      className={`flex h-full flex-col rounded-2xl border border-zinc-200 bg-white p-7 shadow-sm dark:border-white/10 dark:bg-[#1E1E2E] ${
        className ?? ""
      }`}
    >
      {/* Header — matches the dashboard's shared eyebrow + title
          rhythm (13px / 0.18em tracking eyebrow, 24px tracking-tight
          headline). */}
      <h2
        className="font-semibold uppercase text-zinc-400 dark:text-zinc-500"
        style={{ fontSize: 13, letterSpacing: "0.18em" }}
      >
        Goals
      </h2>
      <p className="mt-2 text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
        {goals.length === 0 ? "Nothing tracked yet" : "What you're working on"}
      </p>

      {goals.length === 0 ? (
        <p className="mt-5 text-base leading-relaxed text-zinc-600 dark:text-zinc-300">
          Goals show up here as Acuity hears commitments in your debriefs.
          Mention something you want to do and it&rsquo;ll appear for you
          to accept.
        </p>
      ) : (
        <ul className="mt-6 space-y-4">
          {goals.map((g) => {
            const progress = Math.max(0, Math.min(100, g.progress));
            return (
              <li key={g.id}>
                <div className="flex items-baseline justify-between gap-3">
                  <p className="flex-1 truncate text-[15px] font-medium text-zinc-800 dark:text-zinc-100">
                    {g.title}
                  </p>
                  <span className="shrink-0 text-sm font-semibold tabular-nums text-zinc-700 dark:text-zinc-200">
                    {progress}%
                  </span>
                </div>
                <div className="mt-2 h-1.5 rounded-full bg-zinc-100 dark:bg-white/10">
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

      <div className="mt-auto border-t border-zinc-100 pt-5 dark:border-white/5"
           style={{ marginTop: goals.length === 0 ? "auto" : "1.5rem" }}>
        <Link
          href="/goals"
          className="inline-flex items-center gap-1.5 text-[15px] font-semibold text-violet-600 transition hover:text-violet-500 dark:text-violet-400"
        >
          {goals.length === 0 ? "Open Goals" : "See all goals"}
          <svg
            width="16"
            height="16"
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
