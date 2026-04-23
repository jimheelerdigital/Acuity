import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";

import {
  type UnlockKey,
  type UserProgression,
} from "@acuity/shared";

import { FocusCardStack, type FocusCard } from "./focus-card-stack";

/**
 * Mobile Home focus stack. Mirror of apps/web/src/components/
 * home-focus-stack.tsx. Builds an ordered card queue from the
 * UserProgression passed in and hands it to FocusCardStack.
 *
 * Fetches progression at the Home tab level (not inside this
 * component) so pull-to-refresh works without prop gymnastics —
 * callsite passes `progression` + re-renders on refetch.
 */
export function HomeFocusStack({ progression }: { progression: UserProgression | null }) {
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
  return (
    <View>
      <Text className="text-xs font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">
        Day {progression.dayOfTrial} of your trial
      </Text>
      <Text className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
        {progression.isInTrial
          ? "Keep going — one recording a day is all Acuity needs."
          : "Your trial has wrapped. Acuity keeps working on what you've built."}
      </Text>
    </View>
  );
}
