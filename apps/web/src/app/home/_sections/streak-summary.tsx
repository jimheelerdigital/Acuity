import { Flame } from "lucide-react";

/**
 * Streak + sessions-this-week summary — widget #3. Always shows;
 * copy adapts to streak === 0 vs ≥ 1 days. Owns its data fetch so
 * a slow user-row read here doesn't gate other cards.
 */
export async function StreakSummarySection({ userId }: { userId: string }) {
  const { prisma } = await import("@/lib/prisma");

  const [user, totalEntryCount, sessionsThisWeek] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { currentStreak: true },
    }),
    prisma.entry.count({ where: { userId } }),
    countSessionsThisWeek(userId),
  ]);

  const currentStreak = user?.currentStreak ?? 0;

  let hint: string;
  if (totalEntryCount === 0) {
    hint = "Record today to start the count.";
  } else if (currentStreak === 0) {
    hint = "One recording today restarts the streak.";
  } else {
    hint =
      sessionsThisWeek === 1
        ? "1 session this week so far. Keep it going."
        : `${sessionsThisWeek} sessions this week.`;
  }

  const flameActive = currentStreak >= 2;

  return (
    <section className="flex h-full flex-col justify-between lg:col-span-4 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm sm:p-6 lg:p-7 dark:border-white/10 dark:bg-[#1E1E2E]">
      <div>
        <h2
          className="font-semibold uppercase text-zinc-400 dark:text-zinc-500"
          style={{ fontSize: 13, letterSpacing: "0.18em" }}
        >
          Streak
        </h2>
        <div className="mt-3 flex items-baseline gap-3">
          <Flame
            className={`h-9 w-9 self-center shrink-0 ${
              flameActive ? "text-orange-500" : "text-zinc-300 dark:text-zinc-600"
            }`}
            aria-hidden="true"
            fill={flameActive ? "currentColor" : "none"}
            strokeWidth={flameActive ? 1.5 : 2}
          />
          <span
            className="font-semibold tabular-nums text-zinc-900 dark:text-zinc-50"
            style={{
              fontSize: "clamp(40px, 5vw, 56px)",
              letterSpacing: "-2px",
              lineHeight: 1,
            }}
          >
            {currentStreak}
          </span>
          <span className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
            day streak
          </span>
        </div>
      </div>
      <p className="mt-5 border-t border-zinc-100 pt-4 text-sm text-zinc-600 dark:border-white/5 dark:text-zinc-300">
        {hint}
      </p>
    </section>
  );
}

async function countSessionsThisWeek(userId: string): Promise<number> {
  const { prisma } = await import("@/lib/prisma");
  const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  return prisma.entry.count({
    where: { userId, createdAt: { gte: oneWeekAgo } },
  });
}
