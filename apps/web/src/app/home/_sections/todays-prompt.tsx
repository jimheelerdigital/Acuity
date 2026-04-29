import Link from "next/link";

/**
 * "Today's prompt" card — widget #2. Wraps the recommendation engine
 * output (label + text + optional goalId) in a quote-card. Always
 * populated; the recommendation engine has a 3-tier fallback so it
 * never returns empty.
 *
 * Own data fetch — server-renders independently inside its own
 * Suspense boundary so a slow recommendation query doesn't gate
 * the rest of the dashboard.
 */
export async function TodaysPromptSection({ userId }: { userId: string }) {
  const recommendation = await pickHomeRecommendation(userId);
  const recordHref = recommendation.goalId
    ? `/home?goalId=${encodeURIComponent(recommendation.goalId)}#record`
    : "/home#record";

  return (
    <section className="lg:col-span-8 rounded-2xl border border-zinc-200 bg-gradient-to-br from-violet-50/60 via-white to-white p-5 sm:p-6 lg:p-7 shadow-sm dark:border-white/10 dark:from-violet-950/20 dark:via-[#1E1E2E] dark:to-[#1E1E2E]">
      {recommendation.label && (
        <p
          className="font-semibold uppercase text-violet-600 dark:text-violet-400"
          style={{ fontSize: 13, letterSpacing: "0.18em" }}
        >
          {recommendation.label}
        </p>
      )}
      <p className="mt-3 text-lg font-medium leading-relaxed text-zinc-800 dark:text-zinc-100 lg:text-xl">
        {recommendation.text}
      </p>
      <Link
        href={recordHref}
        className="mt-5 inline-flex items-center gap-1.5 text-[15px] font-semibold text-violet-600 transition hover:text-violet-500 dark:text-violet-400"
      >
        Record about this
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
    </section>
  );
}

async function pickHomeRecommendation(userId: string) {
  const { prisma } = await import("@/lib/prisma");
  const { pickRecommendation } = await import("@/lib/recommendation");
  return pickRecommendation(prisma, userId);
}
