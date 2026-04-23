import { useRouter } from "expo-router";
import { Flame } from "lucide-react-native";
import { useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";

import {
  PROGRESSION_ITEMS,
  type UnlockKey,
  type UserProgression,
} from "@acuity/shared";

import { FocusCardStack, type FocusCard } from "./focus-card-stack";
import { MilestoneCard } from "./milestone-card";

/**
 * Mobile Home focus stack. Mirror of apps/web/src/components/
 * home-focus-stack.tsx. Queue order:
 *   1. Unlock card(s) from recentlyUnlocked
 *   2. Milestone card from recentlyHitMilestone
 *   3. Resting card (day 1-7 scripted, day 8+ streak)
 */
export function HomeFocusStack({
  progression,
}: {
  progression: UserProgression | null;
}) {
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());

  const cards = useMemo<FocusCard[]>(() => {
    if (!progression) return [];
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
    out.push({
      id: "resting",
      type: "resting",
      dismissible: false,
      render: () => <RestingCard progression={progression} />,
    });
    return out;
  }, [progression, dismissedIds]);

  if (!progression) return null;

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
  lifeMatrix:
    "Acuity now has enough entries across enough life areas to show meaningful scores. Swipe to acknowledge.",
  goalSuggestions:
    "Acuity will propose goals from your recordings. Review them on the Goals tab.",
  patternInsights:
    "Acuity starts calling out patterns it sees across your entries. Find them on the Insights tab.",
  themeMap:
    "Your recurring themes now render as a constellation. Open the Theme Map from Insights.",
  weeklyReport:
    "A week of entries + day 7 means your first report is on the way.",
  lifeAudit:
    "Two weeks in. Acuity has generated a long-form letter from your own entries.",
};

const UNLOCK_HREFS: Record<UnlockKey, string> = {
  lifeMatrix: "/(tabs)/insights",
  goalSuggestions: "/(tabs)/goals",
  patternInsights: "/(tabs)/insights",
  themeMap: "/insights/theme-map",
  weeklyReport: "/(tabs)/insights",
  lifeAudit: "/(tabs)/insights",
};

function UnlockCard({ unlockKey }: { unlockKey: UnlockKey }) {
  const router = useRouter();
  return (
    <View className="pr-6">
      <Text className="text-xs font-semibold uppercase tracking-widest text-violet-600 dark:text-violet-400">
        Unlocked
      </Text>
      <Text className="mt-1.5 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
        {UNLOCK_TITLES[unlockKey]}
      </Text>
      <Text className="mt-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">
        {UNLOCK_BODIES[unlockKey]}
      </Text>
      <Pressable
        onPress={() => router.push(UNLOCK_HREFS[unlockKey] as never)}
        className="mt-4 self-start"
      >
        <Text className="text-sm font-semibold text-violet-600 dark:text-violet-400">
          Take a look →
        </Text>
      </Pressable>
    </View>
  );
}

function RestingCard({ progression }: { progression: UserProgression }) {
  if (progression.dayOfTrial <= 7) {
    return <ScriptedResting progression={progression} />;
  }
  return <StreakResting progression={progression} />;
}

function ScriptedResting({ progression }: { progression: UserProgression }) {
  const ageDays = progression.dayOfTrial - 1;
  const latest =
    [...PROGRESSION_ITEMS]
      .reverse()
      .find((it) => ageDays >= it.unlockAfterDays) ?? PROGRESSION_ITEMS[0];
  return (
    <View>
      <Text className="text-xs font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">
        Day {progression.dayOfTrial} of your trial
      </Text>
      <Text className="mt-1.5 text-base font-semibold text-zinc-900 dark:text-zinc-50">
        {latest.title}
      </Text>
      <Text className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
        {latest.description}
      </Text>
    </View>
  );
}

function StreakResting({ progression }: { progression: UserProgression }) {
  const { currentStreak, nextMilestone, streakAtRisk, longestStreak } = progression;

  if (currentStreak === 0) {
    return (
      <View>
        <Text className="text-xs font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">
          Day {progression.dayOfTrial}
        </Text>
        <Text className="mt-1.5 text-base font-semibold text-zinc-900 dark:text-zinc-50">
          {longestStreak > 0
            ? `Your longest streak was ${longestStreak} day${longestStreak === 1 ? "" : "s"}.`
            : "No streak yet."}
        </Text>
        <Text className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
          {longestStreak > 0
            ? "One recording today starts a new one."
            : "One recording today starts it."}
        </Text>
      </View>
    );
  }

  const delta =
    nextMilestone != null ? Math.max(0, nextMilestone - currentStreak) : null;

  return (
    <View>
      <View className="flex-row items-center gap-2">
        <Flame size={18} color="#F97316" />
        <Text className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
          {currentStreak}-day streak
        </Text>
        {streakAtRisk && (
          <View className="rounded-full bg-amber-100 dark:bg-amber-900/40 px-2 py-0.5">
            <Text className="text-[10px] font-semibold text-amber-700 dark:text-amber-300 uppercase tracking-wider">
              At risk
            </Text>
          </View>
        )}
      </View>
      {delta != null && delta > 0 ? (
        <Text className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
          {delta === 1
            ? `1 day to your next milestone (${nextMilestone}).`
            : `${delta} days to your next milestone (${nextMilestone}).`}
        </Text>
      ) : (
        <Text className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
          You&rsquo;ve cleared every milestone Acuity tracks. Keep going.
        </Text>
      )}
      {streakAtRisk && (
        <Text className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          Record today to keep it alive.
        </Text>
      )}
    </View>
  );
}
