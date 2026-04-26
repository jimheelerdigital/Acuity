import { Pressable, ScrollView, Text, View } from "react-native";

import { CATEGORY, TEXT, type CategoryToken } from "./theme-tokens";

/**
 * Mobile mirror of apps/web/src/components/theme-map/ThemeCardsStrip.
 * Horizontal scroll on mobile (5 cards visible by scroll), one card
 * per top theme. Same trend chip + count + mood-descriptor vocabulary.
 */

export type StripTheme = {
  id: string;
  name: string;
  category: CategoryToken;
  count: number;
  meanMood: number;
  trend: { priorPeriodCount: number; ratio: number | null };
};

export function ThemeCardsStrip({
  themes,
  onTap,
}: {
  themes: StripTheme[];
  onTap?: (id: string) => void;
}) {
  const top5 = themes.slice(0, 5);
  if (top5.length === 0) return null;
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: 10, paddingRight: 14 }}
      decelerationRate="fast"
      snapToInterval={196}
    >
      {top5.map((t) => (
        <Card key={t.id} theme={t} onTap={onTap} />
      ))}
    </ScrollView>
  );
}

function Card({
  theme,
  onTap,
}: {
  theme: StripTheme;
  onTap?: (id: string) => void;
}) {
  const c = CATEGORY[theme.category];
  const trend = computeTrend(theme.count, theme.trend.priorPeriodCount);
  const moodDesc = describeMood(theme.meanMood);
  return (
    <Pressable
      onPress={onTap ? () => onTap(theme.id) : undefined}
      style={{
        width: 186,
        padding: 14,
        borderRadius: 12,
        backgroundColor: `${c.solid}10`,
        borderWidth: 0.5,
        borderColor: `${c.solid}66`,
        shadowColor: c.solid,
        shadowOpacity: 0.45,
        shadowRadius: 16,
        shadowOffset: { width: 0, height: 8 },
      }}
    >
      <TrendChip trend={trend} accent={c.solid} />
      <Text
        numberOfLines={1}
        style={{
          marginTop: 12,
          fontSize: 13,
          fontWeight: "500",
          color: TEXT.primary,
          letterSpacing: -0.1,
        }}
      >
        {capitalize(theme.name)}
      </Text>
      <Text
        style={{
          marginTop: 6,
          fontSize: 28,
          fontWeight: "500",
          color: TEXT.primary,
          letterSpacing: -1,
          lineHeight: 30,
          textShadowColor: `${c.solid}99`,
          textShadowRadius: 18,
        }}
      >
        {theme.count}
      </Text>
      <Text
        style={{
          marginTop: 6,
          fontSize: 11,
          color: TEXT.secondary,
        }}
      >
        mood {theme.meanMood.toFixed(1)} ·{" "}
        <Text style={{ color: moodDesc.color }}>{moodDesc.label}</Text>
      </Text>
    </Pressable>
  );
}

type TrendKind = "up" | "new" | "steady" | "fading";
function computeTrend(current: number, prior: number): { kind: TrendKind; multiplier?: number } {
  if (prior === 0 && current > 0) return { kind: "new" };
  if (prior === 0) return { kind: "steady" };
  const ratio = current / prior;
  if (ratio >= 2) return { kind: "up", multiplier: Math.round(ratio) };
  if (ratio < 0.5) return { kind: "fading" };
  if (ratio >= 0.7 && ratio <= 1.3) return { kind: "steady" };
  if (ratio > 1.3) return { kind: "up", multiplier: Math.round(ratio * 10) / 10 };
  return { kind: "fading" };
}

function TrendChip({
  trend,
  accent,
}: {
  trend: ReturnType<typeof computeTrend>;
  accent: string;
}) {
  const labelMap: Record<TrendKind, string> = {
    up: trend.multiplier ? `↑ ${trend.multiplier}× UP` : "↑ UP",
    new: "↑ NEW",
    steady: "STEADY",
    fading: "↓ FADING",
  };
  const dotColor =
    trend.kind === "up" || trend.kind === "new"
      ? accent
      : trend.kind === "fading"
        ? "#FB7185"
        : "rgba(168,168,180,0.7)";
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        alignSelf: "flex-start",
        gap: 5,
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 999,
        backgroundColor: `${dotColor}1f`,
        borderWidth: 0.5,
        borderColor: `${dotColor}55`,
      }}
    >
      <View
        style={{
          width: 5,
          height: 5,
          borderRadius: 999,
          backgroundColor: dotColor,
          shadowColor: dotColor,
          shadowOpacity: 1,
          shadowRadius: 4,
          shadowOffset: { width: 0, height: 0 },
        }}
      />
      <Text
        style={{
          fontSize: 9.5,
          fontWeight: "700",
          letterSpacing: 1,
          color: dotColor,
        }}
      >
        {labelMap[trend.kind]}
      </Text>
    </View>
  );
}

function describeMood(mean: number): { label: string; color: string } {
  if (mean >= 8) return { label: "warm", color: "#FCA85A" };
  if (mean >= 7) return { label: "positive", color: "#34D399" };
  if (mean >= 6) return { label: "reflective", color: "#A78BFA" };
  if (mean >= 5) return { label: "neutral", color: "rgba(168,168,180,0.8)" };
  return { label: "tense", color: "#FB7185" };
}

function capitalize(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}
