import { Ionicons } from "@expo/vector-icons";
import { useEffect, useRef, useState } from "react";
import { Animated, Easing, Text, View } from "react-native";

/**
 * Determinate progress bar + per-stage checklist for the recording-
 * processing screen on mobile. Mirror of the web component — driven by
 * Entry.status transitions from useEntryPolling. The bar's width
 * animates between phase percentages with Animated.timing; below it,
 * a vertical checklist of stages renders pending / active / complete
 * states with circles, mirroring the web layout.
 *
 * Active row pulses (Animated.loop on opacity). Completed rows show a
 * checkmark and an inline duration ("0.8s") computed from client-side
 * phase-transition timestamps captured the moment each phase first
 * arrives.
 *
 * Never shows 100% until phase === "COMPLETE". After 30 seconds
 * elapsed without completion, the elapsed counter swaps for "Still
 * working on this — longer recordings take a bit more.".
 */

const STAGES = [
  { key: "uploading", label: "Uploading", pct: 20 },
  { key: "QUEUED", label: "Saving", pct: 25 },
  { key: "TRANSCRIBING", label: "Transcribing", pct: 60 },
  { key: "EXTRACTING", label: "Extracting themes and patterns", pct: 90 },
  { key: "PERSISTING", label: "Saving insights", pct: 95 },
] as const;

const PHASE_LABELS: Record<string, string> = {
  uploading: "Uploading your recording…",
  QUEUED: "Saving your recording…",
  TRANSCRIBING: "Transcribing your reflection…",
  EXTRACTING: "Pulling out themes and patterns…",
  PERSISTING: "Almost done…",
  COMPLETE: "Done",
};

const STILL_WORKING_THRESHOLD_SECONDS = 30;

function stageIndex(phase: string | null): number {
  if (!phase) return -1;
  if (phase === "COMPLETE") return STAGES.length;
  return STAGES.findIndex((s) => s.key === phase);
}

export function ProcessingProgressBar({
  phase,
  elapsedSeconds,
}: {
  phase: string | null;
  elapsedSeconds: number;
}) {
  const idx = stageIndex(phase);
  const headerLabel = (phase && PHASE_LABELS[phase]) ?? "Starting…";
  const fillPct =
    phase === "COMPLETE" ? 100 : idx >= 0 ? STAGES[idx].pct : 5;
  const showStillWorking =
    elapsedSeconds >= STILL_WORKING_THRESHOLD_SECONDS &&
    phase !== "COMPLETE";

  const widthAnim = useRef(new Animated.Value(fillPct)).current;
  useEffect(() => {
    Animated.timing(widthAnim, {
      toValue: fillPct,
      duration: 700,
      useNativeDriver: false,
    }).start();
  }, [fillPct, widthAnim]);

  const enteredAtRef = useRef<Record<string, number>>({});
  const [, forceTick] = useState(0);
  useEffect(() => {
    if (phase === "COMPLETE") {
      if (!enteredAtRef.current["__complete__"]) {
        enteredAtRef.current["__complete__"] = Date.now();
        forceTick((n) => n + 1);
      }
      return;
    }
    if (idx < 0) return;
    const key = STAGES[Math.min(idx, STAGES.length - 1)].key;
    if (!enteredAtRef.current[key]) {
      enteredAtRef.current[key] = Date.now();
      forceTick((n) => n + 1);
    }
  }, [idx, phase]);

  // Pulsing opacity loop for the active circle.
  const pulseAnim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 0.45,
          duration: 800,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 800,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulseAnim]);

  const widthInterpolation = widthAnim.interpolate({
    inputRange: [0, 100],
    outputRange: ["0%", "100%"],
  });

  return (
    <View className="w-full max-w-sm items-stretch">
      {/* Track + fill. Light-mode track is zinc-200 (was bg-white/10
          which is invisible on white). Fill stays violet-500 in both
          modes. 2026-05-09 contrast fix from Keenan's TestFlight test. */}
      <View className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-white/10">
        <Animated.View
          className="h-full rounded-full bg-violet-500"
          style={{ width: widthInterpolation }}
        />
      </View>

      <View className="mt-4 items-center">
        <Text className="text-center text-base font-semibold text-zinc-900 dark:text-zinc-100">
          {headerLabel}
        </Text>
        <Text className="mt-1 text-center text-xs text-zinc-500 dark:text-zinc-400">
          {showStillWorking
            ? "Still working on this — longer recordings take a bit more."
            : `${elapsedSeconds}s elapsed`}
        </Text>
      </View>

      <View className="mt-5 gap-2.5">
        {STAGES.map((stage, i) => {
          const done = i < idx;
          const active = i === idx;
          const startedAt = enteredAtRef.current[stage.key];
          const nextKey = STAGES[i + 1]?.key;
          const completedAt = nextKey
            ? enteredAtRef.current[nextKey]
            : enteredAtRef.current["__complete__"];
          const durationMs =
            done && startedAt && completedAt
              ? completedAt - startedAt
              : null;

          const Circle = active ? Animated.View : View;
          const circleStyle = active ? { opacity: pulseAnim } : undefined;

          return (
            <View
              key={stage.key}
              className="flex-row items-center gap-3"
            >
              <Circle
                className={`h-5 w-5 items-center justify-center rounded-full border ${
                  done
                    ? "border-violet-500 bg-violet-500"
                    : active
                      ? "border-violet-500 bg-violet-500/20"
                      : "border-zinc-300 bg-transparent dark:border-white/10"
                }`}
                style={circleStyle}
              >
                {done ? (
                  <Ionicons name="checkmark" size={12} color="white" />
                ) : null}
              </Circle>
              <Text
                className={`flex-1 text-sm ${
                  done
                    ? "text-zinc-500 dark:text-zinc-400"
                    : active
                      ? "text-zinc-900 dark:text-zinc-50 font-medium"
                      : "text-zinc-400 dark:text-zinc-600"
                }`}
              >
                {stage.label}
              </Text>
              {durationMs != null && (
                <Text className="text-xs text-zinc-500">
                  {(durationMs / 1000).toFixed(1)}s
                </Text>
              )}
            </View>
          );
        })}
      </View>
    </View>
  );
}
