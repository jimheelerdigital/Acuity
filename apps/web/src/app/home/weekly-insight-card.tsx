import Link from "next/link";

/**
 * Most-recent weekly report insight, surfaced as a quote-card on the
 * dashboard. Pairs with LifeMatrixSnapshot in the "signal tier" of
 * the /home grid — together they answer "what's the AI seeing in me."
 *
 * Source preference order:
 *   1. `report.insightBullets[0]` — the AI's headline takeaway,
 *      already curated to be the most punchy single line
 *   2. `report.narrative.split(". ")[0]` — first sentence of the
 *      long-form narrative if no bullets exist
 *   3. Empty state — graceful "your first report drops Sunday after
 *      your 7th session" with progress text
 *
 * Server component — caller passes the most recent COMPLETE
 * WeeklyReport (or null). Empty state expects `entryCount` so the
 * "X / 7" progress reads correctly.
 */

const ENTRIES_REQUIRED = 7;

export function WeeklyInsightCard({
  report,
  entryCount,
  unlocked,
  topThemes,
}: {
  report: {
    id: string;
    weekStart: Date;
    weekEnd: Date;
    insightBullets: string[];
    narrative: string | null;
  } | null;
  entryCount: number;
  /** Whether the weeklyReport progression gate is open. When false
   *  we render the empty state regardless of report presence — the
   *  /insights page won't show the report yet either, so a quote
   *  here would point users at a gated destination. */
  unlocked: boolean;
  /** Top 2-3 themes by mention count. Surfaced in the empty state
   *  ("what you've reflected on") so the card carries some signal
   *  before the first weekly report drops. Optional — if absent or
   *  empty, the empty state is just progress copy. */
  topThemes?: Array<{ name: string; count: number }>;
}) {
  const snippet = pickSnippet(report);
  const hasContent = unlocked && report != null && snippet != null;

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm sm:p-6 lg:p-7 dark:border-white/10 dark:bg-[#1E1E2E]">
      <div className="flex items-baseline justify-between">
        <div>
          <h2
            className="font-semibold uppercase text-zinc-400 dark:text-zinc-500"
            style={{ fontSize: 13, letterSpacing: "0.18em" }}
          >
            Weekly insight
          </h2>
          <p className="mt-2 text-xl font-semibold tracking-tight md:text-2xl text-zinc-900 dark:text-zinc-50">
            {hasContent
              ? formatWeekHeader(report!.weekStart, report!.weekEnd)
              : "Your first report is coming"}
          </p>
        </div>
      </div>

      {hasContent ? (
        <>
          <figure className="mt-6">
            {/* Vertical rule + quote feel without a serif font.
                Gives the snippet weight as the artifact it is. */}
            <div className="border-l-2 border-violet-500 pl-5">
              <blockquote className="text-base leading-relaxed text-zinc-800 dark:text-zinc-100">
                {snippet}
              </blockquote>
            </div>
          </figure>

          <div className="mt-6 border-t border-zinc-100 pt-5 dark:border-white/5">
            <Link
              href="/insights"
              className="inline-flex items-center gap-1.5 text-[15px] font-semibold text-violet-600 transition hover:text-violet-500 dark:text-violet-400"
            >
              Read the full report
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
        </>
      ) : (
        <div className="mt-6">
          {/* Empty state framed as a progress indicator, not a void.
              Copy mirrors the wording used elsewhere ("Sunday after
              your 7th session") so the user encounters the same
              promise across screens. */}
          <p className="text-base leading-relaxed text-zinc-600 dark:text-zinc-300">
            Once you&rsquo;ve recorded {ENTRIES_REQUIRED} sessions, your
            first weekly report drops Sunday morning — a 400-word read
            on what kept coming up that week.
          </p>
          <div className="mt-5 flex items-center gap-3">
            <div className="h-1.5 flex-1 rounded-full bg-zinc-100 dark:bg-white/10">
              <div
                className="h-1.5 rounded-full bg-violet-500"
                style={{
                  width: `${Math.min(100, (entryCount / ENTRIES_REQUIRED) * 100)}%`,
                }}
              />
            </div>
            <span className="text-sm font-medium tabular-nums text-zinc-500 dark:text-zinc-400">
              {entryCount} / {ENTRIES_REQUIRED}
            </span>
          </div>
          <p className="mt-2.5 text-sm text-zinc-400 dark:text-zinc-500">
            {Math.max(0, ENTRIES_REQUIRED - entryCount) === 0
              ? "Your report is queuing up."
              : ENTRIES_REQUIRED - entryCount === 1
                ? "1 more session unlocks it."
                : `${ENTRIES_REQUIRED - entryCount} more sessions unlock it.`}
          </p>

          {/* "What you've reflected on" — surfaces top themes from
              recent entries while the user waits for their first
              weekly report. Fills the otherwise-empty bottom of the
              card with at-a-glance signal. Only renders when the
              extraction pipeline has produced at least one theme. */}
          {topThemes && topThemes.length > 0 && (
            <div className="mt-6 border-t border-zinc-100 pt-4 dark:border-white/5">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">
                What you&rsquo;ve reflected on
              </p>
              <ul className="mt-3 flex flex-wrap gap-2">
                {topThemes.slice(0, 3).map((t) => (
                  <li
                    key={t.name}
                    className="inline-flex items-center gap-1.5 rounded-full border border-violet-200 bg-violet-50/50 px-2.5 py-1 dark:border-violet-900/40 dark:bg-violet-950/20"
                  >
                    <span className="text-xs font-medium text-violet-700 dark:text-violet-300">
                      {t.name}
                    </span>
                    <span className="text-[10px] font-semibold tabular-nums text-violet-500/70 dark:text-violet-400/70">
                      ×{t.count}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function pickSnippet(
  report: {
    insightBullets: string[];
    narrative: string | null;
  } | null
): string | null {
  if (!report) return null;
  // Order: first insight bullet > first sentence of narrative > null.
  const firstBullet = report.insightBullets?.[0];
  if (firstBullet && firstBullet.trim().length > 0) {
    return firstBullet.trim();
  }
  if (report.narrative && report.narrative.trim().length > 0) {
    // Naive first-sentence split — handles "Mr. " etc poorly, but
    // for AI-generated narratives in the Acuity voice (no
    // abbreviations, plain declarative sentences) this is robust
    // enough. Worst case the user gets a slightly long quote.
    const trimmed = report.narrative.trim();
    const firstStop = trimmed.indexOf(". ");
    if (firstStop > 0 && firstStop < 280) {
      return trimmed.slice(0, firstStop + 1);
    }
    // Long single sentence — cap at 240 chars and append ellipsis.
    if (trimmed.length > 240) {
      return trimmed.slice(0, 240).trimEnd() + "…";
    }
    return trimmed;
  }
  return null;
}

function formatWeekHeader(weekStart: Date, weekEnd: Date): string {
  const startMonth = weekStart.toLocaleDateString("en-US", { month: "short" });
  const startDay = weekStart.getDate();
  const endMonth = weekEnd.toLocaleDateString("en-US", { month: "short" });
  const endDay = weekEnd.getDate();
  if (startMonth === endMonth) {
    return `Week of ${startMonth} ${startDay}–${endDay}`;
  }
  return `Week of ${startMonth} ${startDay} – ${endMonth} ${endDay}`;
}
