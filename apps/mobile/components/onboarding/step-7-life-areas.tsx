import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";

import { DEFAULT_LIFE_AREAS } from "@acuity/shared";

import { useOnboarding } from "./context";

/**
 * Step 7 — Top-3 life-area ranking. Same data shape as the web step 7
 * ({ CAREER: 1, HEALTH: 2, RELATIONSHIPS: 3 }) so the Life Matrix
 * seeding logic downstream works without a mobile-specific branch.
 *
 * Interaction: tap an area to add it. The first tap marks it "1",
 * second "2", third "3". Re-tap a ranked area to unselect, which
 * collapses the higher-ranked picks up one slot. Continue is gated
 * on exactly 3 picks.
 */

export function Step7LifeAreas() {
  const { step, setCanContinue, setCapturedData, getCapturedData } =
    useOnboarding();
  // Rehydrate ordered picks from prior captured priorities (rank 1 first).
  const prior = getCapturedData(step) as
    | { lifeAreaPriorities?: Record<string, number> }
    | null;
  const [picks, setPicks] = useState<string[]>(() => {
    const map = prior?.lifeAreaPriorities;
    if (!map) return [];
    return Object.entries(map)
      .sort(([, a], [, b]) => a - b)
      .map(([k]) => k)
      .slice(0, 3);
  });

  useEffect(() => {
    setCanContinue(picks.length === 3);
    if (picks.length === 0) {
      setCapturedData(null);
      return;
    }
    const priorities: Record<string, number> = {};
    picks.forEach((area, i) => {
      priorities[area] = i + 1;
    });
    setCapturedData({ lifeAreaPriorities: priorities });
  }, [picks, setCanContinue, setCapturedData]);

  const toggle = (enumKey: string) => {
    setPicks((prev) => {
      const idx = prev.indexOf(enumKey);
      if (idx >= 0) return prev.filter((x) => x !== enumKey);
      if (prev.length >= 3) return prev;
      return [...prev, enumKey];
    });
  };

  return (
    <View className="flex-1">
      <Text className="text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
        What matters most?
      </Text>
      <Text className="mt-3 text-base leading-relaxed text-zinc-600 dark:text-zinc-300">
        Pick three. The order matters — these become the lens your
        weekly insights are read through.
      </Text>

      <View className="mt-6 gap-2">
        {DEFAULT_LIFE_AREAS.map((area) => {
          const rank = picks.indexOf(area.enum);
          const selected = rank >= 0;
          return (
            <Pressable
              key={area.enum}
              onPress={() => toggle(area.enum)}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              className={`flex-row items-center gap-3 rounded-2xl border px-4 py-3 ${
                selected
                  ? "border-violet-500 bg-violet-50/60 dark:bg-violet-950/20"
                  : "border-zinc-200 dark:border-white/10 bg-white dark:bg-[#1E1E2E]"
              }`}
            >
              <View
                className={`h-8 w-8 rounded-full items-center justify-center ${
                  selected ? "" : "border border-zinc-200 dark:border-white/10"
                }`}
                style={
                  selected ? { backgroundColor: area.color } : undefined
                }
              >
                {selected ? (
                  <Text className="text-sm font-bold text-white">
                    {rank + 1}
                  </Text>
                ) : (
                  <Ionicons name="ellipse-outline" size={14} color="#A1A1AA" />
                )}
              </View>
              <View className="flex-1">
                <Text
                  className={`text-base font-semibold ${
                    selected
                      ? "text-zinc-900 dark:text-zinc-50"
                      : "text-zinc-800 dark:text-zinc-100"
                  }`}
                >
                  {area.name}
                </Text>
              </View>
              {selected && (
                <Ionicons name="checkmark" size={18} color={area.color} />
              )}
            </Pressable>
          );
        })}
      </View>

      <Text className="mt-6 text-xs text-zinc-400 dark:text-zinc-500">
        {picks.length === 0
          ? "Tap three in order of importance."
          : picks.length < 3
            ? `${3 - picks.length} to go.`
            : "All set — tap Continue."}
      </Text>
    </View>
  );
}
