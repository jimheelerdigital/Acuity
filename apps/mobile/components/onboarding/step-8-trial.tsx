import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";

import { useTheme } from "@/contexts/theme-context";
import type { AcuityTokens } from "@/lib/theme/tokens";

import { useOnboarding } from "./context";

/**
 * Step 8 — Trial explanation + daily-commitment goal-setting. Sets
 * expectations on the trial (14 days, Day 14 audit, post-trial free
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
  const { tokens } = useTheme();
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
      <Text
        className="text-3xl font-semibold tracking-tight"
        style={{ color: tokens.text }}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.75}
      >
        How the trial works
      </Text>
      <Text
        className="mt-3 text-base leading-relaxed"
        style={{ color: tokens.textSec }}
      >
        14 days free. On Day 14 you get your Life Audit — a long-form
        read of your first two weeks. After that, your dashboard freezes
        where it is — entries, insights, and audits don&rsquo;t go
        anywhere. Continue on web to keep generating new content.
      </Text>

      <View className="mt-6 gap-3">
        <TrialPoint
          icon="calendar-outline"
          title="14 days free"
          body="Full access. No credit card yet."
          tokens={tokens}
        />
        <TrialPoint
          icon="book-outline"
          title="Day 30 Life Audit"
          body="A narrative of your first month. Yours to keep."
          tokens={tokens}
        />
        <TrialPoint
          icon="lock-closed-outline"
          title="After the trial"
          body="Journal keeps working in read-only. Continue on web to generate new insights."
          tokens={tokens}
        />
      </View>

      <Text
        className="mt-8 text-base font-semibold"
        style={{ color: tokens.text }}
      >
        Set your daily commitment
      </Text>
      <Text
        className="mt-1 text-sm leading-relaxed"
        style={{ color: tokens.textTer }}
      >
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
              className="rounded-xl border px-4 py-3"
              style={[
                {
                  backgroundColor: active
                    ? `${tokens.primary}1A`
                    : tokens.cardBg,
                  borderColor: active
                    ? tokens.primary
                    : isDailyDefault
                      ? `${tokens.primary}66`
                      : tokens.line,
                },
                active && isDailyDefault ? tokens.glowPrimary : undefined,
              ]}
            >
              <Text
                className="text-sm font-semibold"
                style={{ color: active ? tokens.primary : tokens.text }}
              >
                {c.label}
              </Text>
              <Text
                className="mt-0.5 text-xs"
                style={{ color: tokens.textTer }}
              >
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
  tokens,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  body: string;
  tokens: AcuityTokens;
}) {
  return (
    <View
      className="flex-row items-start gap-3 rounded-2xl border px-4 py-3"
      style={{ borderColor: tokens.line, backgroundColor: tokens.cardBg }}
    >
      <View
        className="h-8 w-8 rounded-full items-center justify-center"
        style={{ backgroundColor: `${tokens.primary}1A` }}
      >
        <Ionicons name={icon} size={16} color={tokens.primary} />
      </View>
      <View className="flex-1">
        <Text
          className="text-sm font-semibold"
          style={{ color: tokens.text }}
        >
          {title}
        </Text>
        <Text
          className="mt-0.5 text-xs leading-snug"
          style={{ color: tokens.textTer }}
        >
          {body}
        </Text>
      </View>
    </View>
  );
}
