import { Flame } from "lucide-react";

import { Card, GradientText, SectionHeader } from "@/components/acuity";

/**
 * Streak + sessions-this-week summary — widget #3. Always shows;
 * copy adapts to streak === 0 vs ≥ 1 days. Owns its data fetch so
 * a slow user-row read here doesn't gate other cards.
 *
 * Slice 9 (2026-05-22): visual refresh to canonical primitives.
 *   - Card wrapper (default variant) replaces bespoke border+bg
 *   - SectionHeader replaces uppercase Tailwind h2
 *   - GradientText renders the streak number with the canonical
 *     coral→violet gradMix, mirroring the mobile streak tile
 *   - Flame stays as the activated indicator at currentStreak >= 2
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
    <div className="lg:col-span-4">
      <Card variant="default" radius="xl" padding={6} className="flex h-full flex-col justify-between sm:p-7">
        <div>
          <SectionHeader label="Streak" />
          <div className="mt-3 flex items-baseline gap-3">
            <Flame
              className={`h-9 w-9 shrink-0 self-center ${
                flameActive ? "text-orange-500" : "text-zinc-300 dark:text-acuity-text-quiet"
              }`}
              aria-hidden="true"
              fill={flameActive ? "currentColor" : "none"}
              strokeWidth={flameActive ? 1.5 : 2}
            />
            {flameActive ? (
              <GradientText
                variant="mix"
                className="font-display font-extrabold leading-none"
                style={{
                  fontSize: "clamp(40px, 5vw, 56px)",
                  letterSpacing: "-2px",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {currentStreak}
              </GradientText>
            ) : (
              <span
                className="font-display font-extrabold leading-none text-zinc-900 dark:text-acuity-text"
                style={{
                  fontSize: "clamp(40px, 5vw, 56px)",
                  letterSpacing: "-2px",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {currentStreak}
              </span>
            )}
            <span className="text-sm font-medium text-zinc-500 dark:text-acuity-text-sec">
              day streak
            </span>
          </div>
        </div>
        <p className="mt-5 border-t border-acuity-line pt-4 text-sm text-zinc-600 dark:text-acuity-text-sec">
          {hint}
        </p>
      </Card>
    </div>
  );
}

async function countSessionsThisWeek(userId: string): Promise<number> {
  const { prisma } = await import("@/lib/prisma");
  const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  return prisma.entry.count({
    where: { userId, createdAt: { gte: oneWeekAgo } },
  });
}
