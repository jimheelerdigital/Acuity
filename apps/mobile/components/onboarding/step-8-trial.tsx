import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";

import { useOnboarding } from "./context";

/**
 * Step 8 — Trial explanation. Sets expectations: 14 days, Day 14
 * audit, post-trial free tier. Also captures the user's intended
 * cadence (DAILY / WEEKDAYS / WEEKLY / UNSURE) so the reminders step
 * defaults can line up and downstream reports know how to talk
 * about streaks.
 */

const FREQUENCIES: Array<{ value: string; label: string; hint: string }> = [
  { value: "DAILY", label: "Daily", hint: "Every day, ideally." },
  { value: "WEEKDAYS", label: "Weekdays", hint: "5 times a week." },
  { value: "WEEKLY", label: "Weekly", hint: "Once or twice a week." },
  { value: "UNSURE", label: "Not sure", hint: "I'll see how it feels." },
];

export function Step8Trial() {
  const { setCanContinue, setCapturedData } = useOnboarding();
  const [frequency, setFrequency] = useState<string | null>(null);

  useEffect(() => {
    setCanContinue(true);
    setCapturedData(
      frequency ? { expectedUsageFrequency: frequency } : null
    );
  }, [frequency, setCanContinue, setCapturedData]);

  return (
    <View className="flex-1">
      <Text className="text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
        How the trial works
      </Text>
      <Text className="mt-3 text-base leading-relaxed text-zinc-600 dark:text-zinc-300">
        14 days free. On Day 14 you get your Life Audit — a long-form
        read of your first two weeks. After that, subscribe to keep
        generating. Nothing disappears.
      </Text>

      <View className="mt-6 gap-3">
        <TrialPoint
          icon="calendar-outline"
          title="14 days free"
          body="Full access. No credit card yet."
        />
        <TrialPoint
          icon="book-outline"
          title="Day 14 Life Audit"
          body="A narrative of your two weeks. Yours to keep."
        />
        <TrialPoint
          icon="lock-closed-outline"
          title="After the trial"
          body="Journal keeps working in read-only. Subscribe to generate new insights."
        />
      </View>

      <Text className="mt-8 text-sm font-semibold text-zinc-800 dark:text-zinc-100">
        How often do you think you&apos;ll use it?
      </Text>
      <View className="mt-3 gap-2">
        {FREQUENCIES.map((f) => {
          const active = frequency === f.value;
          return (
            <Pressable
              key={f.value}
              onPress={() => setFrequency(active ? null : f.value)}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              className={`rounded-xl border px-4 py-3 ${
                active
                  ? "border-violet-500 bg-violet-50/60 dark:bg-violet-950/20"
                  : "border-zinc-200 dark:border-white/10 bg-white dark:bg-[#1E1E2E]"
              }`}
            >
              <Text
                className={`text-sm font-semibold ${
                  active
                    ? "text-violet-700 dark:text-violet-300"
                    : "text-zinc-800 dark:text-zinc-100"
                }`}
              >
                {f.label}
              </Text>
              <Text className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                {f.hint}
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
