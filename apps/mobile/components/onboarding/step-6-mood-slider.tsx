import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useState } from "react";
import {
  GestureResponderEvent,
  LayoutChangeEvent,
  PanResponder,
  Text,
  View,
} from "react-native";

import { moodBucketFromScore, moodLabelForScore } from "@acuity/shared";

import { useOnboarding } from "./context";

/**
 * Step 6 — Mood baseline (1-10 drag slider, therapy-app style).
 *
 * Spec 2026-04-23: upgraded from the 5-emoji grid + 1-5 rank to a
 * 10-point numerical slider with a red → amber → green gradient
 * track. Output written as both `moodBaselineNumeric` (1-10 int) and
 * `moodBaseline` (bucketed string via moodBucketFromScore) so legacy
 * consumers like the Life Audit prompt keep working.
 *
 * Gesture: PanResponder driving a thumb over a gradient track — no
 * slider native module required.
 */

const MIN = 1;
const MAX = 10;
const DEFAULT_VALUE = 5;

export function Step6MoodSlider() {
  const { setCanContinue, setCapturedData } = useOnboarding();
  const [value, setValue] = useState(DEFAULT_VALUE);
  const [trackWidth, setTrackWidth] = useState(0);

  useEffect(() => {
    setCanContinue(true);
    setCapturedData({
      moodBaseline: moodBucketFromScore(value),
      moodBaselineNumeric: value,
    });
  }, [value, setCanContinue, setCapturedData]);

  const setFromTouch = (locationX: number) => {
    if (trackWidth <= 0) return;
    const t = Math.max(0, Math.min(1, locationX / trackWidth));
    const next = Math.round(MIN + t * (MAX - MIN));
    setValue(next);
  };

  const panResponder = PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: (e: GestureResponderEvent) =>
      setFromTouch(e.nativeEvent.locationX),
    onPanResponderMove: (e: GestureResponderEvent) =>
      setFromTouch(e.nativeEvent.locationX),
  });

  const thumbPct = ((value - MIN) / (MAX - MIN)) * 100;

  return (
    <View className="flex-1">
      <Text className="text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
        How&apos;s your baseline lately?
      </Text>
      <Text className="mt-3 text-base leading-relaxed text-zinc-600 dark:text-zinc-300">
        The average of the last couple of weeks — not today
        specifically. Drag to where it feels right.
      </Text>

      <View className="mt-16 items-center">
        <Text className="text-4xl font-semibold text-zinc-900 dark:text-zinc-50">
          {value}
          <Text className="text-2xl font-medium text-zinc-400 dark:text-zinc-500">
            /10
          </Text>
        </Text>
        <Text className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
          {moodLabelForScore(value)}
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
          <LinearGradient
            colors={["#FDA4AF", "#FCD34D", "#6EE7B7"]}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={{ height: 8, borderRadius: 999 }}
          />

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
              borderWidth: 2,
              borderColor: "#18181B",
              shadowColor: "#000",
              shadowOpacity: 0.15,
              shadowRadius: 4,
              shadowOffset: { width: 0, height: 2 },
              elevation: 3,
              alignSelf: "center",
            }}
          />
        </View>

        {/* End labels */}
        <View className="mt-3 flex-row justify-between">
          <Text className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
            Rough
          </Text>
          <Text className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
            Okay
          </Text>
          <Text className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
            Strong
          </Text>
        </View>
      </View>

      <Text className="mt-10 text-xs text-zinc-400 dark:text-zinc-500">
        No right answer. Acuity uses this to frame your first
        week&rsquo;s entries against your own baseline.
      </Text>
    </View>
  );
}
