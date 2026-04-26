import { useEffect } from "react";
import { Text, View } from "react-native";
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import Svg, {
  Circle,
  Defs,
  FeGaussianBlur,
  Filter,
  G,
  Line,
  LinearGradient as SvgLinearGradient,
  RadialGradient,
  Stop,
  Text as SvgText,
} from "react-native-svg";

import { CATEGORY, TEXT, type CategoryToken } from "./theme-tokens";

/**
 * Mobile mirror of apps/web/src/components/theme-map/ThemeRings.
 * FOUR concentric rings = top 4 themes for the active period. Each
 * ring's color comes from that theme's category. Same composition
 * rules as web; scaled for a phone (300×300 viewBox).
 */

export type RingTheme = {
  id: string;
  name: string;
  category: CategoryToken;
  count: number;
};

export type ThemePeriods = {
  today: { count: number; mood: number };
  week: { count: number; mood: number };
  month: { count: number; mood: number };
};

export type ThemeRingsTimeWindow =
  | "week"
  | "month"
  | "3months"
  | "6months"
  | "all";

const PERIOD_PHRASE: Record<ThemeRingsTimeWindow, string> = {
  week: "this week",
  month: "this month",
  "3months": "this quarter",
  "6months": "the last 6 months",
  all: "all time",
};

const SIZE = 300;
const CX = SIZE / 2;
const CY = SIZE / 2;

const RING_SLOTS = [
  { r: 50, sw: 18 },
  { r: 78, sw: 14 },
  { r: 102, sw: 11 },
  { r: 124, sw: 9 },
];

export function ThemeRings({
  topThemes,
  totalMentions,
  periods,
  timeWindow,
}: {
  topThemes: RingTheme[];
  totalMentions: number;
  periods: ThemePeriods;
  timeWindow: ThemeRingsTimeWindow;
}) {
  const rings = topThemes.slice(0, 4);
  const topTheme = rings[0];

  const pulse = useSharedValue(1);
  useEffect(() => {
    pulse.value = withRepeat(
      withTiming(1.04, {
        duration: 2000,
        easing: Easing.inOut(Easing.ease),
      }),
      -1,
      true
    );
    return () => cancelAnimation(pulse);
  }, [pulse]);
  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulse.value }],
  }));

  if (!topTheme) {
    return (
      <View
        style={{
          padding: 24,
          borderRadius: 16,
          backgroundColor: "rgba(255,255,255,0.02)",
          borderWidth: 0.5,
          borderColor: "rgba(255,255,255,0.08)",
          alignItems: "center",
        }}
      >
        <Text style={{ fontSize: 13, color: "rgba(168,168,180,0.7)" }}>
          No themes yet — record your first reflection to see patterns appear.
        </Text>
      </View>
    );
  }

  const topCount = Math.max(1, topTheme.count);
  const periodPhrase = PERIOD_PHRASE[timeWindow];
  const topAccent = CATEGORY[topTheme.category].solid;

  return (
    <View
      style={{
        backgroundColor: "rgba(255,255,255,0.02)",
        borderWidth: 0.5,
        borderColor: "rgba(255,255,255,0.08)",
        borderRadius: 16,
        padding: 16,
        gap: 16,
      }}
    >
      <View style={{ alignItems: "center", width: "100%" }}>
        <View style={{ width: SIZE, height: SIZE }}>
          <Svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
            <Defs>
              {rings.map((t, i) => {
                const c = CATEGORY[t.category];
                return (
                  <SvgLinearGradient
                    key={`grad-${t.id}-${i}`}
                    id={`ring-grad-${i}`}
                    x1="0"
                    y1="0"
                    x2="1"
                    y2="1"
                  >
                    <Stop offset="0%" stopColor={c.solid} />
                    <Stop offset="55%" stopColor={c.accent} />
                    <Stop offset="100%" stopColor={c.accent} stopOpacity={0.85} />
                  </SvgLinearGradient>
                );
              })}
              <Filter id="rings-glow" x="-30%" y="-30%" width="160%" height="160%">
                <FeGaussianBlur stdDeviation="6" />
              </Filter>
              <RadialGradient id="rings-bg" cx="50%" cy="50%" r="50%">
                <Stop offset="0%" stopColor={topAccent} stopOpacity={0.25} />
                <Stop offset="100%" stopColor={topAccent} stopOpacity={0} />
              </RadialGradient>
            </Defs>

            <Circle cx={CX} cy={CY} r={140} fill="url(#rings-bg)" />

            {rings.map((t, i) => {
              const slot = RING_SLOTS[i];
              const c = CATEGORY[t.category];
              return (
                <Circle
                  key={`track-${t.id}-${i}`}
                  cx={CX}
                  cy={CY}
                  r={slot.r}
                  fill="none"
                  stroke={`${c.solid}26`}
                  strokeWidth={slot.sw}
                />
              );
            })}

            {rings.map((t, i) => {
              const slot = RING_SLOTS[i];
              const c = 2 * Math.PI * slot.r;
              const ratio = Math.max(0.08, Math.min(1, t.count / topCount));
              const filled = ratio * c;
              const dasharray = `${filled} ${c - filled}`;
              return (
                <G key={`arc-${t.id}-${i}`}>
                  <Circle
                    cx={CX}
                    cy={CY}
                    r={slot.r}
                    fill="none"
                    stroke={`url(#ring-grad-${i})`}
                    strokeWidth={slot.sw}
                    strokeLinecap="round"
                    strokeDasharray={dasharray}
                    transform={`rotate(-90 ${CX} ${CY})`}
                    filter="url(#rings-glow)"
                    opacity={0.7}
                  />
                  <Circle
                    cx={CX}
                    cy={CY}
                    r={slot.r}
                    fill="none"
                    stroke={`url(#ring-grad-${i})`}
                    strokeWidth={slot.sw}
                    strokeLinecap="round"
                    strokeDasharray={dasharray}
                    transform={`rotate(-90 ${CX} ${CY})`}
                  />
                </G>
              );
            })}
          </Svg>

          <Animated.View
            pointerEvents="none"
            style={[
              {
                position: "absolute",
                inset: 0,
                alignItems: "center",
                justifyContent: "center",
              } as object,
              pulseStyle,
            ]}
          >
            <Text
              style={{
                fontSize: 11,
                letterSpacing: 1.8,
                fontWeight: "500",
                color: "rgba(252,168,90,0.85)",
                textTransform: "uppercase",
              }}
            >
              TOP THEME · {periodPhrase}
            </Text>
            <Text
              style={{
                fontSize: 52,
                fontWeight: "500",
                color: "#FAFAFA",
                letterSpacing: -1,
                marginTop: 4,
                textShadowColor: `${topAccent}99`,
                textShadowRadius: 18,
              }}
            >
              {topTheme.count}
            </Text>
            <Text
              style={{
                marginTop: 6,
                fontSize: 14,
                fontWeight: "500",
                color: "rgba(228,228,231,0.9)",
                textAlign: "center",
                maxWidth: 180,
              }}
              numberOfLines={1}
            >
              {capitalize(topTheme.name)}
            </Text>
            <Text
              style={{
                marginTop: 2,
                fontSize: 11,
                color: "rgba(168,168,180,0.7)",
              }}
            >
              {topTheme.count} {topTheme.count === 1 ? "mention" : "mentions"}
            </Text>
          </Animated.View>
        </View>
      </View>

      {/* Compact rank list (mobile-friendly version of leader labels) */}
      <View style={{ borderTopWidth: 0.5, borderTopColor: "rgba(255,255,255,0.06)", paddingTop: 12, gap: 6 }}>
        {rings.map((t, i) => {
          const c = CATEGORY[t.category];
          return (
            <View
              key={`rank-${t.id}`}
              style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
            >
              <View
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: 999,
                  backgroundColor: c.solid,
                  shadowColor: c.solid,
                  shadowOpacity: 1,
                  shadowRadius: 6,
                  shadowOffset: { width: 0, height: 0 },
                }}
              />
              <Text
                style={{
                  fontSize: 11,
                  fontWeight: "600",
                  color: "rgba(168,168,180,0.5)",
                  width: 22,
                }}
              >
                {String(i + 1).padStart(2, "0")}
              </Text>
              <Text
                numberOfLines={1}
                style={{ flex: 1, fontSize: 14, fontWeight: "500", color: TEXT.primary }}
              >
                {capitalize(t.name)}
              </Text>
              <Text style={{ fontSize: 14, fontWeight: "500", color: "rgba(168,168,180,0.85)" }}>
                {t.count}
              </Text>
            </View>
          );
        })}
      </View>

      <NarrativeBlock
        topTheme={topTheme}
        topThemes={rings}
        totalMentions={totalMentions}
        periods={periods}
        periodPhrase={periodPhrase}
      />
    </View>
  );
}

function NarrativeBlock({
  topTheme,
  topThemes,
  totalMentions,
  periods,
  periodPhrase,
}: {
  topTheme: RingTheme;
  topThemes: RingTheme[];
  totalMentions: number;
  periods: ThemePeriods;
  periodPhrase: string;
}) {
  const enoughThemes = topThemes.length >= 3;
  const pct = totalMentions > 0 ? Math.round((topTheme.count / totalMentions) * 100) : 0;

  return (
    <View style={{ borderTopWidth: 0.5, borderTopColor: "rgba(255,255,255,0.06)", paddingTop: 14 }}>
      <Text
        style={{
          fontSize: 14,
          letterSpacing: 2,
          fontWeight: "700",
          color: "#FCA85A",
          textTransform: "uppercase",
        }}
      >
        What stood out
      </Text>
      <Text
        style={{
          marginTop: 6,
          fontSize: 24,
          fontWeight: "500",
          letterSpacing: -0.3,
          color: TEXT.primary,
          lineHeight: 30,
        }}
      >
        {enoughThemes ? (
          <>
            <Text style={{ fontWeight: "600" }}>{capitalize(topTheme.name)}</Text>{" "}
            is your top theme {periodPhrase} — {topTheme.count}{" "}
            {topTheme.count === 1 ? "mention" : "mentions"}, {pct}% of total.
          </>
        ) : (
          <>
            <Text style={{ fontWeight: "600" }}>{capitalize(topTheme.name)}</Text>{" "}
            is the only recurring theme {periodPhrase}. Keep journaling to surface more patterns.
          </>
        )}
      </Text>
      <View
        style={{
          marginTop: 12,
          flexDirection: "row",
          gap: 10,
        }}
      >
        <PeriodStat label="TODAY" count={periods.today.count} dot="#FB923C" />
        <PeriodStat label="WEEK" count={periods.week.count} dot="#A78BFA" />
        <PeriodStat label="MONTH" count={periods.month.count} dot="#22D3EE" />
      </View>
    </View>
  );
}

function PeriodStat({ label, count, dot }: { label: string; count: number; dot: string }) {
  return (
    <View style={{ flex: 1 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
        <View
          style={{
            width: 5,
            height: 5,
            borderRadius: 999,
            backgroundColor: dot,
            shadowColor: dot,
            shadowOpacity: 1,
            shadowRadius: 4,
            shadowOffset: { width: 0, height: 0 },
          }}
        />
        <Text
          style={{
            fontSize: 14,
            letterSpacing: 1.8,
            fontWeight: "700",
            color: "rgba(168,168,180,0.7)",
          }}
        >
          {label}
        </Text>
      </View>
      <Text
        style={{
          marginTop: 4,
          fontSize: 36,
          fontWeight: "500",
          letterSpacing: -1,
          color: TEXT.primary,
        }}
      >
        {count}
      </Text>
    </View>
  );
}

function capitalize(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}
