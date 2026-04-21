import { useEffect, useState } from "react";
import {
  GestureResponderEvent,
  LayoutChangeEvent,
  PanResponder,
  Text,
  View,
} from "react-native";

import type { Mood } from "@acuity/shared";

import { useOnboarding } from "./context";

/**
 * Step 6 — Mood baseline slider (1..5).
 *
 * Spec asked for a slider replacement for the web's 5-emoji grid.
 * Dead-simple impl: a horizontally-laid 1..5 scale with a draggable
 * thumb. Values map to the existing Mood enum so the shared
 * extraction pipeline + baseline-seeding logic keep working without
 * a schema change:
 *
 *   1 ROUGH  "Struggling"
 *   2 LOW    "A little low"
 *   3 NEUTRAL "Okay"
 *   4 GOOD   "Good"
 *   5 GREAT  "Thriving"
 *
 * Implemented with PanResponder rather than a slider dep — we don't
 * have @react-native-community/slider in the bundle and this is
 * ~30 lines of gesture code. Avoids a native rebuild for one screen.
 */

const RANK_TO_MOOD: Record<number, Mood> = {
  1: "ROUGH",
  2: "LOW",
  3: "NEUTRAL",
  4: "GOOD",
  5: "GREAT",
};
const LABELS: Record<number, string> = {
  1: "Struggling",
  2: "A little low",
  3: "Okay",
  4: "Good",
  5: "Thriving",
};

const MIN = 1;
const MAX = 5;
// Start in the middle — the user picks explicitly; Continue stays
// enabled because the step is skippable.
const DEFAULT_RANK = 3;

export function Step6MoodSlider() {
  const { setCanContinue, setCapturedData } = useOnboarding();
  const [rank, setRank] = useState(DEFAULT_RANK);
  const [trackWidth, setTrackWidth] = useState(0);

  useEffect(() => {
    setCanContinue(true);
    setCapturedData({ moodBaseline: RANK_TO_MOOD[rank] });
  }, [rank, setCanContinue, setCapturedData]);

  const setFromTouch = (locationX: number) => {
    if (trackWidth <= 0) return;
    const t = Math.max(0, Math.min(1, locationX / trackWidth));
    const nextRank = Math.round(MIN + t * (MAX - MIN));
    setRank(nextRank);
  };

  const panResponder = PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: (e: GestureResponderEvent) =>
      setFromTouch(e.nativeEvent.locationX),
    onPanResponderMove: (e: GestureResponderEvent) =>
      setFromTouch(e.nativeEvent.locationX),
  });

  const thumbPct = ((rank - MIN) / (MAX - MIN)) * 100;

  return (
    <View className="flex-1">
      <Text className="text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
        How&apos;s your baseline?
      </Text>
      <Text className="mt-3 text-base leading-relaxed text-zinc-600 dark:text-zinc-300">
        The average of the last couple of weeks — not today
        specifically. Drag to where it feels right.
      </Text>

      <View className="mt-16 items-center">
        <Text className="text-4xl font-semibold text-zinc-900 dark:text-zinc-50">
          {LABELS[rank]}
        </Text>
        <Text className="mt-2 text-sm text-zinc-400 dark:text-zinc-500">
          {rank} / 5
        </Text>
      </View>

      <View className="mt-14 px-2">
        <View
          className="h-12 justify-center"
          {...panResponder.panHandlers}
          onLayout={(e: LayoutChangeEvent) =>
            setTrackWidth(e.nativeEvent.layout.width)
          }
        >
          {/* Track */}
          <View className="h-2 rounded-full bg-zinc-200 dark:bg-white/10 overflow-hidden">
            <View
              className="h-full rounded-full bg-violet-500"
              style={{ width: `${thumbPct}%` }}
            />
          </View>

          {/* Tick marks */}
          <View className="absolute left-0 right-0 flex-row justify-between top-1 px-0">
            {[1, 2, 3, 4, 5].map((n) => (
              <View
                key={n}
                className={`h-2 w-2 rounded-full ${
                  n <= rank
                    ? "bg-violet-600"
                    : "bg-zinc-300 dark:bg-white/20"
                }`}
              />
            ))}
          </View>

          {/* Thumb */}
          <View
            pointerEvents="none"
            style={{
              position: "absolute",
              left: `${thumbPct}%`,
              marginLeft: -14,
              width: 28,
              height: 28,
              borderRadius: 14,
              backgroundColor: "#FFFFFF",
              borderWidth: 3,
              borderColor: "#7C3AED",
              shadowColor: "#000",
              shadowOpacity: 0.12,
              shadowRadius: 4,
              shadowOffset: { width: 0, height: 2 },
              elevation: 3,
              alignSelf: "center",
            }}
          />
        </View>

        {/* End labels */}
        <View className="mt-3 flex-row justify-between">
          <Text className="text-xs text-zinc-500 dark:text-zinc-400">
            Struggling
          </Text>
          <Text className="text-xs text-zinc-500 dark:text-zinc-400">
            Thriving
          </Text>
        </View>
      </View>

      <Text className="mt-10 text-xs text-zinc-400 dark:text-zinc-500">
        No right answer. We use this to frame your first week&rsquo;s
        entries against your own baseline.
      </Text>
    </View>
  );
}
