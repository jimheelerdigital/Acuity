import { useEffect, useRef } from "react";
import { Animated, Text, View } from "react-native";

/**
 * Determinate progress bar for the recording-processing screen on
 * mobile. Mirror of the web component — driven by Entry.status
 * transitions from useEntryPolling. Phase → percent → animated width
 * via Animated.timing so the bar visually advances smoothly between
 * polling ticks rather than jumping.
 *
 * Never shows 100% until phase === "COMPLETE". After 30s elapsed
 * without completion, swaps the elapsed counter for "Still working
 * on this — longer recordings take a bit more."
 */

const PHASE_PROGRESS: Record<string, { pct: number; label: string }> = {
  uploading: { pct: 20, label: "Uploading your recording…" },
  QUEUED: { pct: 25, label: "Saving your recording…" },
  TRANSCRIBING: { pct: 60, label: "Transcribing your reflection…" },
  EXTRACTING: { pct: 90, label: "Pulling out themes and patterns…" },
  PERSISTING: { pct: 95, label: "Almost done…" },
  COMPLETE: { pct: 100, label: "Done" },
};

const STILL_WORKING_THRESHOLD_SECONDS = 30;

export function ProcessingProgressBar({
  phase,
  elapsedSeconds,
}: {
  phase: string | null;
  elapsedSeconds: number;
}) {
  const fallback = { pct: 5, label: "Starting…" };
  const config = phase ? PHASE_PROGRESS[phase] ?? fallback : fallback;
  const widthAnim = useRef(new Animated.Value(config.pct)).current;

  useEffect(() => {
    Animated.timing(widthAnim, {
      toValue: config.pct,
      duration: 700,
      useNativeDriver: false,
    }).start();
  }, [config.pct, widthAnim]);

  const showStillWorking =
    elapsedSeconds >= STILL_WORKING_THRESHOLD_SECONDS && phase !== "COMPLETE";

  const widthInterpolation = widthAnim.interpolate({
    inputRange: [0, 100],
    outputRange: ["0%", "100%"],
  });

  return (
    <View className="w-full max-w-sm items-stretch">
      <View className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
        <Animated.View
          className="h-full rounded-full bg-violet-500"
          style={{ width: widthInterpolation }}
        />
      </View>
      <View className="mt-4 items-center">
        <Text className="text-center text-base font-semibold text-zinc-100">
          {config.label}
        </Text>
        <Text className="mt-1 text-center text-xs text-zinc-400">
          {showStillWorking
            ? "Still working on this — longer recordings take a bit more."
            : `${elapsedSeconds}s elapsed`}
        </Text>
      </View>
    </View>
  );
}
