import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";

import { useOnboarding } from "./context";

/**
 * Step 8 — Trial explanation + daily-commitment goal-setting. Sets
 * expectations on the trial (30 days, Day 30 audit, post-trial free
 * tier) and captures a target cadence on the User row.
 *
 * The target cadence is goal-setting only — Acuity doesn't gate any
 * feature on it. Default selection is "daily" because more entries
 * = better extraction; the lower options are still respectful of
 * user autonomy without offering opt-outs ("Not sure" / "Weekly"
 * were dropped because they read as soft cancellations).
 */

type Cadence = "daily" | "most_days" | "few_times_week";

const CADENCES: Array<{ value: Cadence; label: string; hint: string }> = [
  { value: "daily", label: "Daily", hint: "I'm in. Every day." },
  { value: "most_days", label: "Most days", hint: "5–6 times a week." },
  {
    value: "few_times_week",
    label: "A few times a week",
    hint: "When I have something to reflect on.",
  },
];

const DEFAULT_CADENCE: Cadence = "daily";

export function Step8Trial() {
  const { step, setCanContinue, setCapturedData, getCapturedData } =
    useOnboarding();
  const prior = getCapturedData(step) as
    | { targetCadence?: Cadence }
    | null;
  const [cadence, setCadence] = useState<Cadence>(
    () => prior?.targetCadence ?? DEFAULT_CADENCE
  );

  useEffect(() => {
    setCanContinue(true);
    setCapturedData({ targetCadence: cadence });
  }, [cadence, setCanContinue, setCapturedData]);

  return (
    <View className="flex-1">
      <Text className="text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
        How the trial works
      </Text>
      <Text className="mt-3 text-base leading-relaxed text-zinc-600 dark:text-zinc-300">
        30 days free. On Day 30 you get your Life Audit — a long-form
        read of your first month. After that, subscribe to keep
        generating. Nothing disappears.
      </Text>

      <View className="mt-6 gap-3">
        <TrialPoint
          icon="calendar-outline"
          title="30 days free"
          body="Full access. No credit card yet."
        />
        <TrialPoint
          icon="book-outline"
          title="Day 30 Life Audit"
          body="A narrative of your first month. Yours to keep."
        />
        <TrialPoint
          icon="lock-closed-outline"
          title="After the trial"
          body="Journal keeps working in read-only. Subscribe to generate new insights."
        />
      </View>

      <Text className="mt-8 text-base font-semibold text-zinc-800 dark:text-zinc-100">
        Set your daily commitment
      </Text>
      <Text className="mt-1 text-sm text-zinc-500 dark:text-zinc-400 leading-relaxed">
        Acuity gets better with daily reflection. Pick a starting
        cadence — you can change it anytime.
      </Text>
      <View className="mt-3 gap-2">
        {CADENCES.map((c) => {
          const active = cadence === c.value;
          const isDailyDefault = c.value === "daily";
          return (
            <Pressable
              key={c.value}
              onPress={() => setCadence(c.value)}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              className={`rounded-xl border px-4 py-3 ${
                active
                  ? "border-violet-500 bg-violet-50/60 dark:bg-violet-950/20"
                  : isDailyDefault
                    ? "border-violet-500/40 bg-white dark:bg-[#1E1E2E]"
                    : "border-zinc-200 dark:border-white/10 bg-white dark:bg-[#1E1E2E]"
              }`}
              style={
                active && isDailyDefault
                  ? {
                      shadowColor: "#7C3AED",
                      shadowOpacity: 0.35,
                      shadowRadius: 12,
                      shadowOffset: { width: 0, height: 4 },
                    }
                  : undefined
              }
            >
              <Text
                className={`text-sm font-semibold ${
                  active
                    ? "text-violet-700 dark:text-violet-300"
                    : "text-zinc-800 dark:text-zinc-100"
                }`}
              >
                {c.label}
              </Text>
              <Text className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                {c.hint}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function TrialPoint({
  icon,
  title,
  body,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  body: string;
}) {
  return (
    <View className="flex-row items-start gap-3 rounded-2xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#1E1E2E] px-4 py-3">
      <View className="h-8 w-8 rounded-full bg-violet-600/10 items-center justify-center">
        <Ionicons name={icon} size={16} color="#7C3AED" />
      </View>
      <View className="flex-1">
        <Text className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
          {title}
        </Text>
        <Text className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400 leading-snug">
          {body}
        </Text>
      </View>
    </View>
  );
}
