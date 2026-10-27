import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { Text, View } from "react-native";

import type { UserProgression } from "@acuity/shared";

import { useTheme } from "@/contexts/theme-context";
import { api } from "@/lib/api";

/**
 * "What lifts you, what drains you" (2026-10-27). Day-level mood compared
 * across themes, people, habits and calendar load over the last 60 days.
 * Server: GET /api/insights/lifts-drains (apps/web/src/lib/lifts-drains.ts
 * has the minimum-data rules: 10+ scored days, 4+ days on each side, and
 * a gap of 0.75+ points).
 *
 * Shown once Pattern Insights unlocks (PATTERN_INSIGHTS_MIN_ENTRIES), matching the
 * UserInsightsCard next to it. Pro on the server (a 402 renders nothing).
 * Renders nothing when there's no finding. Apple Health findings stay
 * in the Health & mood card, so nothing here repeats them.
 */

type Factor = {
  kind: "theme" | "person" | "habit" | "calendar";
  label: string;
  direction: "lift" | "drain";
  withAvg: number;
  withoutAvg: number;
  withDays: number;
  withoutDays: number;
  observation: string;
};

type Payload = { lifts: Factor[]; drains: Factor[]; scoredDays: number };

const ICON: Record<Factor["kind"], keyof typeof Ionicons.glyphMap> = {
  theme: "chatbubble-ellipses-outline",
  person: "person-outline",
  habit: "checkmark-circle-outline",
  calendar: "calendar-outline",
};

export function LiftsDrainsCard({
  progression,
}: {
  progression: UserProgression | null;
}) {
  const { tokens } = useTheme();
  const [data, setData] = useState<Payload | null>(null);
  const unlocked = !!progression?.unlocked.patternInsights;

  useEffect(() => {
    if (!unlocked) return;
    let alive = true;
    api
      .get<Payload>("/api/insights/lifts-drains")
      .then((r) => alive && setData(r))
      .catch(() => alive && setData(null));
    return () => {
      alive = false;
    };
  }, [unlocked]);

  if (!unlocked || !data) return null;
  if (data.lifts.length === 0 && data.drains.length === 0) return null;

  const section = (title: string, items: Factor[], color: string) =>
    items.length === 0 ? null : (
      <View className="mb-2">
        <Text className="text-xs font-semibold mb-2" style={{ color }}>
          {title}
        </Text>
        {items.map((f) => (
          <View key={`${f.kind}-${f.label}`} className="flex-row items-start mb-3">
            <Ionicons name={ICON[f.kind]} size={18} color={color} style={{ marginTop: 1 }} />
            <View className="flex-1 ml-3">
              <Text className="text-sm" style={{ color: tokens.text, lineHeight: 20 }}>
                {f.observation}
              </Text>
              <Text className="text-[11px] mt-0.5" style={{ color: tokens.textTer }}>
                {f.withDays} days vs {f.withoutDays} days
              </Text>
            </View>
          </View>
        ))}
      </View>
    );

  return (
    <View
      className="mb-6 rounded-2xl border p-4"
      style={{ borderColor: tokens.line, backgroundColor: tokens.cardBg }}
    >
      <Text
        className="mb-3 text-xs font-semibold uppercase tracking-widest"
        style={{ color: tokens.textTer }}
      >
        What lifts you, what drains you
      </Text>
      {section("Lifts", data.lifts, tokens.primary)}
      {section("Drains", data.drains, tokens.textSec)}
      <Text className="text-[11px]" style={{ color: tokens.textTer }}>
        Mood out of 10, from your last 60 days of entries. Patterns, not proof.
      </Text>
    </View>
  );
}
