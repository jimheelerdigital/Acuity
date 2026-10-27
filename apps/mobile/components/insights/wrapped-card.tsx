import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";

import {
  wrappedPeriodForCard,
  wrappedPeriodKey,
  type WrappedSummary,
} from "@acuity/shared";

import { useTheme } from "@/contexts/theme-context";
import { api } from "@/lib/api";
import { todayLocalDate } from "@/lib/habits-api";

/**
 * Ripple Wrapped entry card for Insights (2026-10-27).
 *
 * Self-contained: decides which recap to offer from today's local date
 * (last month during days 1–7; the year from Dec 15 to Jan 7), fetches it,
 * and renders nothing unless the user has enough entries for a recap.
 * Tapping opens /insights/wrapped?period=… . No props.
 */
export function WrappedCard() {
  const { tokens } = useTheme();
  const router = useRouter();
  const [data, setData] = useState<WrappedSummary | null>(null);

  const period = wrappedPeriodForCard(todayLocalDate());
  const key = period ? wrappedPeriodKey(period) : null;

  useEffect(() => {
    if (!key) return;
    let alive = true;
    api
      .get<WrappedSummary>(`/api/insights/wrapped?period=${key}`)
      .then((d) => alive && setData(d))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [key]);

  if (!key || !data || !data.eligible) return null;

  const title =
    data.period.kind === "year"
      ? `${data.period.label}, wrapped`
      : `Your ${data.period.label.split(" ")[0]}, wrapped`;
  const sub = [
    `${data.entries} debriefs`,
    data.topThemes[0] ? `mostly ${data.topThemes[0].theme.toLowerCase()}` : null,
    data.habitStreak ? `${data.habitStreak.days}-day streak` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <Pressable
      onPress={() => router.push(`/insights/wrapped?period=${key}` as never)}
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${sub}. Open your recap`}
      style={{ marginBottom: 24, borderRadius: tokens.radius.lg, overflow: "hidden" }}
    >
      <LinearGradient
        colors={tokens.gradMix.colors as unknown as readonly [string, string, ...string[]]}
        locations={tokens.gradMix.locations as unknown as readonly [number, number, ...number[]]}
        start={tokens.gradMix.start}
        end={tokens.gradMix.end}
        style={{ padding: 18 }}
      >
        <Text
          style={{
            fontFamily: tokens.fontSans,
            fontSize: 11,
            fontWeight: "700",
            letterSpacing: 2,
            textTransform: "uppercase",
            color: "rgba(255,255,255,0.85)",
          }}
        >
          Ripple Wrapped
        </Text>
        <Text
          style={{
            fontFamily: tokens.fontDisplay,
            fontSize: 24,
            color: "#ffffff",
            marginTop: 6,
          }}
        >
          {title}
        </Text>
        <Text style={{ fontFamily: tokens.fontSans, fontSize: 14, color: "rgba(255,255,255,0.9)", marginTop: 4 }}>
          {sub}
        </Text>
        <View style={{ flexDirection: "row", marginTop: 14 }}>
          <View
            style={{
              backgroundColor: "rgba(255,255,255,0.22)",
              borderRadius: tokens.radius.pill,
              paddingHorizontal: 14,
              paddingVertical: 7,
            }}
          >
            <Text style={{ fontFamily: tokens.fontSans, fontSize: 13, fontWeight: "600", color: "#ffffff" }}>
              See your recap →
            </Text>
          </View>
        </View>
      </LinearGradient>
    </Pressable>
  );
}
