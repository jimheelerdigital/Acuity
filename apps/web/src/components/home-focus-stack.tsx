"use client";

import { Flame } from "lucide-react";
import { useMemo, useState } from "react";

import {
  PROGRESSION_ITEMS,
  type UnlockKey,
  type UserProgression,
} from "@acuity/shared";

import { FocusCardStack, type FocusCard } from "./focus-card-stack";
import { MilestoneCard } from "./milestone-card";

/**
 * Home-page card stack. Takes the UserProgression snapshot fetched
 * by the server, builds an ordered queue, hands it to FocusCardStack.
 *
 * Render contract (2026-04-24):
 *
 *   - Renders ONLY when there is celebration content to show —
 *     `recentlyUnlocked.length > 0` OR `recentlyHitMilestone != null`.
 *     A user on day 30 with a fully-unlocked product and no recent
 *     milestone should NOT see this stack above the dashboard grid.
 *     The streak / progression-resting content that previously lived
 *     here as a non-dismissible "resting card" has moved INTO the
 *     dashboard grid (StreakSummaryCard widget on /home).
 *
 *   - When celebration content IS present, the resting card is
 *     appended below the celebration cards as before so the user
 *     still has a quiet streak/milestone reference under the
 *     dismissible cards.
 *
 * Order (top → bottom) when shown:
 *   1. Feature unlock cards — one per recentlyUnlocked key
 *   2. Streak milestone card — if recentlyHitMilestone set
 *   3. Resting card — only when (1) or (2) is also showing
 *
 * One-shot semantics: the progression API writes the snapshot back
 * on each call, so recentlyUnlocked + recentlyHitMilestone clear on
 * the next mount. No separate dismissal column; session-only state
 * suffices for celebration cards.
 */
export function HomeFocusStack({ progression }: { progression: UserProgression }) {
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());

  const hasCelebrationContent =
    progression.recentlyUnlocked.length > 0 ||
    progression.recentlyHitMilestone != null;

  const cards = useMemo<FocusCard[]>(() => {
    const out: FocusCard[] = [];
    for (const key of progression.recentlyUnlocked) {
      const id = `unlock:${key}`;
      if (dismissedIds.has(id)) continue;
      out.push({
        id,
        type: "unlock",
        dismissible: true,
        render: () => <UnlockCard unlockKey={key} />,
      });
    }
    if (progression.recentlyHitMilestone != null) {
      const m = progression.recentlyHitMilestone;
      const id = `milestone:${m}`;
      if (!dismissedIds.has(id)) {
        out.push({
          id,
          type: "milestone",
          dismissible: true,
          render: () => <MilestoneCard milestone={m} />,
        });
      }
    }
    // Only append the resting card when there's other content above
    // it. On a quiet visit (no celebrations) the dashboard grid's
    // StreakSummaryCard handles the streak read; rendering the
    // resting card here too would be redundant.
    if (out.length > 0) {
      out.push({
        id: "resting",
        type: "resting",
        dismissible: false,
        render: () => <RestingCard progression={progression} />,
      });
    }
    return out;
  }, [progression, dismissedIds]);

  // Early-return null when there's nothing to celebrate. The /home
  // page renders the grid right under where this would have been —
  // power users see no top stack.
  if (!hasCelebrationContent) return null;
  if (cards.length === 0) return null;

  return (
    <FocusCardStack
      cards={cards}
      onDismiss={(card) =>
        setDismissedIds((prev) => {
          if (prev.has(card.id)) return prev;
          const next = new Set(prev);
          next.add(card.id);
          return next;
        })
      }
    />
  );
}

const UNLOCK_TITLES: Record<UnlockKey, string> = {
  lifeMatrix: "Your Life Matrix just unlocked",
  goalSuggestions: "Goal Suggestions are live",
  patternInsights: "Pattern Insights unlocked",
  themeMap: "Your Theme Map is ready",
  weeklyReport: "Your first Weekly Report is queued",
  lifeAudit: "Your Day 14 Life Audit is ready",
};

const UNLOCK_BODIES: Record<UnlockKey, string> = {
  lifeMatrix: "Acuity now has enough entries across enough life areas to show meaningful scores. Swipe to acknowledge.",
  goalSuggestions: "Acuity will propose goals from your recordings. Review them on the Goals page.",
  patternInsights: "Acuity starts calling out patterns it sees across your entries. Find them on the Insights page.",
  themeMap: "Your recurring themes now render as a constellation. Open the Theme Map from Insights.",
  weeklyReport: "A week of entries + day 7 means your first report is on the way.",
  lifeAudit: "Two weeks in. Acuity has generated a long-form letter from your own entries.",
};

const UNLOCK_HREFS: Record<UnlockKey, string> = {
  lifeMatrix: "/insights",
  goalSuggestions: "/goals",
  patternInsights: "/insights",
  themeMap: "/insights/theme-map",
  weeklyReport: "/insights",
  lifeAudit: "/insights",
};

function UnlockCard({ unlockKey }: { unlockKey: UnlockKey }) {
  return (
    <div className="pr-6">
      <p className="text-xs font-semibold uppercase tracking-widest text-violet-600 dark:text-violet-400">
        Unlocked
      </p>
      <h3 className="mt-1.5 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
        {UNLOCK_TITLES[unlockKey]}
      </h3>
      <p className="mt-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">
        {UNLOCK_BODIES[unlockKey]}
      </p>
      <a
        href={UNLOCK_HREFS[unlockKey]}
        className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-violet-600 dark:text-violet-400 hover:text-violet-500"
      >
        Take a look
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <path d="M9 18l6-6-6-6" />
        </svg>
      </a>
    </div>
  );
}

/**
 * Resting card body. Day-aware:
 *   - Days 1-7: the latest PROGRESSION_ITEMS entry the user has
 *     unlocked-by-day (scripted guidance)
 *   - Day 8+: streak-driven content — current streak + progress to
 *     next milestone, or gentler re-engagement if streak is 0
 */
function RestingCard({ progression }: { progression: UserProgression }) {
  if (progression.dayOfTrial <= 7) {
    return <ScriptedResting progression={progression} />;
  }
  return <StreakResting progression={progression} />;
}

function ScriptedResting({ progression }: { progression: UserProgression }) {
  // Pick the latest item the user has "unlocked-by-day."
  const ageDays = progression.dayOfTrial - 1;
  const latest =
    [...PROGRESSION_ITEMS]
      .reverse()
      .find((it) => ageDays >= it.unlockAfterDays) ?? PROGRESSION_ITEMS[0];
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">
        Day {progression.dayOfTrial} of your trial
      </p>
      <h3 className="mt-1.5 text-base font-semibold text-zinc-900 dark:text-zinc-50">
        {latest.title}
      </h3>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
        {latest.description}
      </p>
    </div>
  );
}

function StreakResting({ progression }: { progression: UserProgression }) {
  const { currentStreak, nextMilestone, streakAtRisk, longestStreak } = progression;

  if (currentStreak === 0) {
    // Broken-streak / never-started. Gentle re-engagement; no
    // milestone delta shown — that'd feel accusatory.
    return (
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">
          Day {progression.dayOfTrial}
        </p>
        <h3 className="mt-1.5 text-base font-semibold text-zinc-900 dark:text-zinc-50">
          {longestStreak > 0
            ? `Your longest streak was ${longestStreak} day${longestStreak === 1 ? "" : "s"}.`
            : "No streak yet."}
        </h3>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
          {longestStreak > 0
            ? "One recording today starts a new one."
            : "One recording today starts it."}
        </p>
      </div>
    );
  }

  const delta =
    nextMilestone != null ? Math.max(0, nextMilestone - currentStreak) : null;

  return (
    <div>
      <div className="flex items-center gap-2">
        <Flame className="h-5 w-5 text-orange-500" aria-hidden="true" />
        <p className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
          {currentStreak}-day streak
        </p>
        {streakAtRisk && (
          <span className="rounded-full bg-amber-100 dark:bg-amber-900/40 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-300 uppercase tracking-wider">
            At risk
          </span>
        )}
      </div>
      {delta != null && delta > 0 ? (
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
          {delta === 1
            ? `1 day to your next milestone (${nextMilestone}).`
            : `${delta} days to your next milestone (${nextMilestone}).`}
        </p>
      ) : (
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
          You&rsquo;ve cleared every milestone Acuity tracks. Keep going.
        </p>
      )}
      {streakAtRisk && (
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          Record today to keep it alive.
        </p>
      )}
    </div>
  );
}
