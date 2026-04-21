import type { StateOfMeContent } from "@acuity/shared";

/**
 * Editorial reader for a State of Me report. Serif font on the
 * closing reflection + generous whitespace signal "long-form" vs
 * the quick-scan weekly report.
 *
 * Reused by both the authenticated detail page and the public share
 * view so the two stay visually consistent.
 */

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function StateOfMeReader({
  periodStart,
  periodEnd,
  content,
}: {
  periodStart: string;
  periodEnd: string;
  content: StateOfMeContent;
}) {
  const hasAny =
    content.majorThemes?.length ||
    content.goalsProgress?.length ||
    content.keyRelationships?.length ||
    content.patternsNoticed?.length ||
    content.closingReflection;

  if (!hasAny) {
    return (
      <article className="mt-8">
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Report content is missing. This shouldn&apos;t happen — please
          reach out if you see this.
        </p>
      </article>
    );
  }

  return (
    <article className="mt-6">
      <p className="text-xs font-semibold uppercase tracking-widest text-violet-600 dark:text-violet-400">
        State of Me
      </p>
      <h1 className="mt-2 text-3xl font-semibold text-zinc-900 dark:text-zinc-50 tracking-tight leading-tight">
        {content.headline || "Your quarter"}
      </h1>
      <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
        {fmtDate(periodStart)} — {fmtDate(periodEnd)}
      </p>

      {content.emotionalArc?.narrative && (
        <section className="mt-10">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500 mb-3">
            Emotional arc
          </h2>
          <p className="text-lg leading-relaxed text-zinc-800 dark:text-zinc-100 italic">
            {content.emotionalArc.narrative}
          </p>
        </section>
      )}

      {content.majorThemes && content.majorThemes.length > 0 && (
        <section className="mt-10">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500 mb-4">
            Major themes
          </h2>
          <div className="space-y-5">
            {content.majorThemes.map((t, i) => (
              <div key={i}>
                <div className="flex items-center gap-2 mb-1.5">
                  <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-50 capitalize">
                    {t.theme}
                  </h3>
                  <span className="rounded-full bg-zinc-100 dark:bg-white/5 px-2 py-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">
                    {t.mentions} mention{t.mentions === 1 ? "" : "s"}
                  </span>
                </div>
                {t.excerpt && (
                  <p className="text-sm text-zinc-600 dark:text-zinc-300 leading-relaxed italic border-l-2 border-zinc-200 dark:border-white/10 pl-4">
                    &ldquo;{t.excerpt}&rdquo;
                  </p>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {content.lifeMatrixMovement && content.lifeMatrixMovement.length > 0 && (
        <section className="mt-10">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500 mb-3">
            Life Matrix movement
          </h2>
          <ul className="space-y-1">
            {content.lifeMatrixMovement.map((m) => (
              <li
                key={m.area}
                className="flex items-center justify-between py-1 border-b border-zinc-100 dark:border-white/5 last:border-0"
              >
                <span className="text-sm text-zinc-700 dark:text-zinc-200">
                  {m.area}
                </span>
                <span
                  className={`text-sm font-semibold ${
                    m.delta > 0
                      ? "text-emerald-600 dark:text-emerald-400"
                      : m.delta < 0
                        ? "text-amber-600 dark:text-amber-400"
                        : "text-zinc-500 dark:text-zinc-400"
                  }`}
                >
                  {m.delta > 0 ? "↑" : m.delta < 0 ? "↓" : "·"}{" "}
                  {Math.abs(m.delta)} ({m.scoreStart} → {m.scoreEnd})
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {content.goalsProgress && content.goalsProgress.length > 0 && (
        <section className="mt-10">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500 mb-3">
            Goals this quarter
          </h2>
          <ul className="space-y-2">
            {content.goalsProgress.map((g, i) => (
              <li
                key={i}
                className="flex items-start justify-between gap-3 rounded-xl border border-zinc-200 dark:border-white/10 px-4 py-2.5"
              >
                <div className="flex-1">
                  <p className="text-sm text-zinc-800 dark:text-zinc-100">
                    {g.title}
                  </p>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5 capitalize">
                    {g.verdict}
                  </p>
                </div>
                <span className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 tabular-nums">
                  {g.progress}%
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {content.keyRelationships && content.keyRelationships.length > 0 && (
        <section className="mt-10">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500 mb-3">
            People mentioned
          </h2>
          <div className="space-y-3">
            {content.keyRelationships.map((r, i) => (
              <div key={i}>
                <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                  {r.name}{" "}
                  <span className="text-xs font-normal text-zinc-400 dark:text-zinc-500">
                    · {r.mentionCount} mention{r.mentionCount === 1 ? "" : "s"}
                  </span>
                </p>
                <p className="mt-0.5 text-sm text-zinc-600 dark:text-zinc-300 leading-relaxed">
                  {r.evolution}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      {content.patternsNoticed && content.patternsNoticed.length > 0 && (
        <section className="mt-10">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500 mb-3">
            Patterns worth noticing
          </h2>
          <ul className="space-y-3">
            {content.patternsNoticed.map((p, i) => (
              <li key={i} className="text-sm text-zinc-700 dark:text-zinc-200 flex gap-3">
                <span className="text-violet-500 shrink-0 mt-0.5">→</span>
                <span>
                  {p.observation}
                  {p.supporting && (
                    <span className="block mt-1 text-xs text-zinc-500 dark:text-zinc-400 italic">
                      &ldquo;{p.supporting}&rdquo;
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {content.closingReflection && (
        <section className="mt-12 pt-10 border-t border-zinc-200 dark:border-white/10">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500 mb-5">
            Reflection
          </h2>
          <div
            className="text-lg leading-[1.75] text-zinc-800 dark:text-zinc-100 space-y-5"
            style={{
              fontFamily:
                "'Playfair Display', ui-serif, Georgia, 'Times New Roman', serif",
            }}
          >
            {content.closingReflection.split(/\n\n+/).map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>
        </section>
      )}
    </article>
  );
}
