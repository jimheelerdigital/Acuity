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

import { TEXT } from "./theme-tokens";

/**
 * Mobile counterpart to apps/web/src/components/theme-map/ThemeRings.
 * Same three-ring composition + centre pulse + leader lines, scaled
 * to fit a phone (300×300 viewBox).
 */

export type ThemePeriods = {
  today: { count: number; mood: number };
  week: { count: number; mood: number };
  month: { count: number; mood: number };
};

const SIZE = 300;
const CX = SIZE / 2;
const CY = SIZE / 2;

const RINGS = [
  {
    r: 66,
    sw: 18,
    gradId: "today-grad",
    track: "rgba(251,146,60,0.18)",
    label: "TODAY",
    accent: "#FB923C",
    stops: [
      { o: "0%", c: "#FB923C" },
      { o: "55%", c: "#FBBF24" },
      { o: "100%", c: "#FDE68A" },
    ],
  },
  {
    r: 100,
    sw: 15,
    gradId: "week-grad",
    track: "rgba(139,92,246,0.18)",
    label: "WEEK",
    accent: "#8B5CF6",
    stops: [
      { o: "0%", c: "#A78BFA" },
      { o: "55%", c: "#8B5CF6" },
      { o: "100%", c: "#60A5FA" },
    ],
  },
  {
    r: 130,
    sw: 12,
    gradId: "month-grad",
    track: "rgba(34,211,238,0.18)",
    label: "MONTH",
    accent: "#22D3EE",
    stops: [
      { o: "0%", c: "#22D3EE" },
      { o: "100%", c: "#A78BFA" },
    ],
  },
];

export function ThemeRings({
  periods,
  topThemeName,
  totalMentions,
}: {
  periods: ThemePeriods;
  topThemeName: string;
  totalMentions: number;
}) {
  const TARGET_TODAY = Math.max(8, periods.today.count * 1.5);
  const TARGET_WEEK = Math.max(20, periods.week.count * 1.25);
  const TARGET_MONTH = Math.max(40, periods.month.count * 1.1);

  const counts = [periods.today.count, periods.week.count, periods.month.count];
  const targets = [TARGET_TODAY, TARGET_WEEK, TARGET_MONTH];

  // Centre pulse
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
              {RINGS.map((r) => (
                <SvgLinearGradient
                  key={r.gradId}
                  id={r.gradId}
                  x1="0"
                  y1="0"
                  x2="1"
                  y2="1"
                >
                  {r.stops.map((s) => (
                    <Stop key={s.o} offset={s.o} stopColor={s.c} />
                  ))}
                </SvgLinearGradient>
              ))}
              <Filter id="rings-glow" x="-30%" y="-30%" width="160%" height="160%">
                <FeGaussianBlur stdDeviation="6" />
              </Filter>
              <RadialGradient id="rings-bg" cx="50%" cy="50%" r="50%">
                <Stop offset="0%" stopColor="#FB923C" stopOpacity={0.25} />
                <Stop offset="100%" stopColor="#FB923C" stopOpacity={0} />
              </RadialGradient>
            </Defs>

            <Circle cx={CX} cy={CY} r={142} fill="url(#rings-bg)" />

            {RINGS.map((r) => (
              <Circle
                key={`track-${r.gradId}`}
                cx={CX}
                cy={CY}
                r={r.r}
                fill="none"
                stroke={r.track}
                strokeWidth={r.sw}
              />
            ))}

            {RINGS.map((r, i) => {
              const c = 2 * Math.PI * r.r;
              const filled = Math.min(1, counts[i] / targets[i]) * c;
              const dasharray = `${filled} ${c - filled}`;
              return (
                <G key={r.gradId}>
                  <Circle
                    cx={CX}
                    cy={CY}
                    r={r.r}
                    fill="none"
                    stroke={`url(#${r.gradId})`}
                    strokeWidth={r.sw}
                    strokeLinecap="round"
                    strokeDasharray={dasharray}
                    transform={`rotate(-90 ${CX} ${CY})`}
                    filter="url(#rings-glow)"
                    opacity={0.75}
                  />
                  <Circle
                    cx={CX}
                    cy={CY}
                    r={r.r}
                    fill="none"
                    stroke={`url(#${r.gradId})`}
                    strokeWidth={r.sw}
                    strokeLinecap="round"
                    strokeDasharray={dasharray}
                    transform={`rotate(-90 ${CX} ${CY})`}
                  />
                </G>
              );
            })}

            {/* Leader lines */}
            <Line
              x1={42}
              y1={32}
              x2={124}
              y2={56}
              stroke="rgba(34,211,238,0.5)"
              strokeWidth={0.8}
              strokeDasharray="3 4"
            />
            <SvgText
              x={14}
              y={28}
              fontSize={11}
              fontWeight="500"
              fill="#22D3EE"
              letterSpacing={1.8}
            >
              MONTH
            </SvgText>
            <Line
              x1={258}
              y1={42}
              x2={186}
              y2={74}
              stroke="rgba(139,92,246,0.5)"
              strokeWidth={0.8}
              strokeDasharray="3 4"
            />
            <SvgText
              x={252}
              y={36}
              fontSize={11}
              fontWeight="500"
              fill="#A78BFA"
              letterSpacing={1.8}
            >
              WEEK
            </SvgText>
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
                color: "#FCA85A",
                textTransform: "uppercase",
              }}
            >
              TODAY · {topThemeName.toUpperCase()}
            </Text>
            <Text
              style={{
                fontSize: 48,
                fontWeight: "500",
                color: "#FAFAFA",
                letterSpacing: -1.5,
                marginTop: 4,
                textShadowColor: "rgba(251,146,60,0.6)",
                textShadowRadius: 18,
              }}
            >
              {periods.today.count}
            </Text>
            <Text
              style={{
                fontSize: 12,
                marginTop: 4,
                color: "rgba(168,168,180,0.8)",
              }}
            >
              mentions so far
            </Text>
          </Animated.View>
        </View>
      </View>

      <NarrativeBlock
        topThemeName={topThemeName}
        periods={periods}
        totalMentions={totalMentions}
      />
    </View>
  );
}

function NarrativeBlock({
  topThemeName,
  periods,
  totalMentions,
}: {
  topThemeName: string;
  periods: ThemePeriods;
  totalMentions: number;
}) {
  const headline = buildHeadline(topThemeName, periods, totalMentions);
  return (
    <View style={{ borderTopWidth: 0.5, borderTopColor: "rgba(255,255,255,0.06)", paddingTop: 14 }}>
      <Text
        style={{
          fontSize: 12,
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
          fontSize: 20,
          fontWeight: "500",
          letterSpacing: -0.3,
          color: TEXT.primary,
          lineHeight: 26,
        }}
      >
        <Text style={{ fontWeight: "600" }}>{capitalize(topThemeName)}</Text>{" "}
        {headline}
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
            fontSize: 12,
            letterSpacing: 1.6,
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
          fontSize: 28,
          fontWeight: "500",
          letterSpacing: -0.5,
          color: TEXT.primary,
        }}
      >
        {count}
      </Text>
    </View>
  );
}

function buildHeadline(
  _name: string,
  periods: ThemePeriods,
  totalMentions: number
): string {
  const today = periods.today.count;
  const week = periods.week.count;
  const month = periods.month.count;
  if (today > 0) {
    if (week > today && week > 0) {
      const pct = Math.round((today / week) * 100);
      return `came up ${today} ${today === 1 ? "time" : "times"} today — already ${pct}% of this week's count.`;
    }
    return `came up ${today} ${today === 1 ? "time" : "times"} today.`;
  }
  if (month > 0) {
    const pct = totalMentions > 0 ? Math.round((month / totalMentions) * 100) : 0;
    return `came up ${month} ${month === 1 ? "time" : "times"} this month${pct > 0 ? ` — ${pct}% of all your themes.` : "."}`;
  }
  return "is your most-mentioned recurring thread.";
}

function capitalize(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

