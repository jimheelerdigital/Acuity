import * as Haptics from "expo-haptics";
import { useEffect } from "react";
import {
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
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
  G,
  Line,
  LinearGradient as SvgLinearGradient,
  Path,
  RadialGradient,
  Rect,
  Stop,
  Text as SvgText,
} from "react-native-svg";

/**
 * Mobile counterpart to apps/web/src/components/theme-map/ThemeMapDashboard.
 * Same five layers, same gradient + glow vocabulary, scaled to a phone.
 *
 * All graphics via react-native-svg. Layout via plain RN Views — no
 * NativeWind on the chart surface so the geometry is deterministic
 * across screen sizes. The reanimated SharedValue powers only the
 * 3.5s pulse on the hero count.
 */

export type SentimentTone = "positive" | "challenging" | "neutral";

export type DashboardTheme = {
  id: string;
  name: string;
  mentionCount: number;
  tone: SentimentTone;
  sparkline: number[];
  trendDescription: string;
  firstMentionedDaysAgo: number;
};

type Gradient = {
  from: string;
  via: string;
  to: string;
  glow: string;
  soft: string;
};

const SENTIMENT: Record<SentimentTone, Gradient> = {
  positive: {
    from: "#FB923C",
    via: "#FBBF24",
    to: "#FDE68A",
    glow: "rgba(251,146,60,0.42)",
    soft: "#FCD34D",
  },
  neutral: {
    from: "#A78BFA",
    via: "#60A5FA",
    to: "#22D3EE",
    glow: "rgba(96,165,250,0.42)",
    soft: "#93C5FD",
  },
  challenging: {
    from: "#F472B6",
    via: "#FB7185",
    to: "#F87171",
    glow: "rgba(244,114,182,0.42)",
    soft: "#FDA4AF",
  },
};

const PERIOD_LABEL: Record<string, string> = {
  week: "this week",
  month: "this month",
  "3months": "the last 3 months",
  "6months": "the last 6 months",
  all: "across all your sessions",
};

export function ThemeMapDashboard({
  themes,
  totalMentions,
  timeWindow,
  onTap,
}: {
  themes: DashboardTheme[];
  totalMentions: number;
  timeWindow: string;
  onTap?: (id: string) => void;
}) {
  const top = themes[0];
  const tilesRow = themes.slice(0, 6);
  const longTail = themes.slice(6, 15);
  const periodLabel = PERIOD_LABEL[timeWindow] ?? PERIOD_LABEL.month;

  if (!top) {
    return (
      <View
        style={{
          paddingVertical: 40,
          paddingHorizontal: 24,
          alignItems: "center",
        }}
      >
        <Text
          style={{
            fontSize: 13,
            textAlign: "center",
            color: "rgba(161,161,170,0.75)",
          }}
        >
          Not enough themes yet — record a few more sessions and
          they&rsquo;ll start showing up here.
        </Text>
      </View>
    );
  }

  return (
    <View
      style={{
        marginHorizontal: 14,
        marginTop: 14,
        borderRadius: 24,
        backgroundColor: "#0A0A14",
        overflow: "hidden",
      }}
    >
      <Atmosphere tone={top.tone} />
      <View style={{ padding: 18, gap: 22 }}>
        <HeroRingPanel
          top={top}
          themes={themes}
          totalMentions={totalMentions}
          periodLabel={periodLabel}
        />
        <WaveChart themes={themes.slice(0, 3)} />
        <TileGrid themes={tilesRow} onTap={onTap} />
        {longTail.length > 0 && <FrequencySpectrum themes={longTail} />}
      </View>
    </View>
  );
}

// ─── Atmosphere ─────────────────────────────────────────────────────

function Atmosphere({ tone }: { tone: SentimentTone }) {
  const g = SENTIMENT[tone];
  return (
    <Svg
      pointerEvents="none"
      style={{
        position: "absolute",
        top: -60,
        left: 0,
        right: 0,
        height: 360,
      }}
      width="100%"
      height={360}
      preserveAspectRatio="none"
    >
      <Defs>
        <RadialGradient id="bg-glow" cx="50%" cy="20%" r="60%">
          <Stop offset="0%" stopColor={g.from} stopOpacity={0.22} />
          <Stop offset="50%" stopColor={g.via} stopOpacity={0.1} />
          <Stop offset="100%" stopColor={g.from} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Rect x="0" y="0" width="100%" height="100%" fill="url(#bg-glow)" />
    </Svg>
  );
}

// ─── Hero ring + narrative ─────────────────────────────────────────

function HeroRingPanel({
  top,
  themes,
  totalMentions,
  periodLabel,
}: {
  top: DashboardTheme;
  themes: DashboardTheme[];
  totalMentions: number;
  periodLabel: string;
}) {
  const g = SENTIMENT[top.tone];
  const share = totalMentions > 0 ? top.mentionCount / totalMentions : 0;
  const sharePct = Math.round(share * 100);
  const second = themes[1];
  const ratioCopy =
    second && second.mentionCount > 0
      ? top.mentionCount >= second.mentionCount * 2
        ? `${Math.round(top.mentionCount / second.mentionCount)}× more often than anything else`
        : `the leading thread you keep returning to`
      : `the only recurring thread so far`;

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 14,
        padding: 16,
        borderRadius: 18,
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.05)",
        backgroundColor: "rgba(255,255,255,0.02)",
      }}
    >
      <HeroRing share={share} count={top.mentionCount} tone={top.tone} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text
          style={{
            fontSize: 9,
            letterSpacing: 2,
            fontWeight: "700",
            color: g.soft,
            textTransform: "uppercase",
          }}
        >
          What stood out
        </Text>
        <Text
          style={{
            marginTop: 6,
            fontSize: 17,
            fontWeight: "700",
            letterSpacing: -0.2,
            color: "#FAFAFA",
            lineHeight: 21,
          }}
        >
          {capitalize(top.name)} came up {top.mentionCount}{" "}
          {top.mentionCount === 1 ? "time" : "times"} {periodLabel}.
        </Text>
        <Text
          style={{
            marginTop: 6,
            fontSize: 12,
            lineHeight: 17,
            color: "rgba(228,228,231,0.78)",
          }}
        >
          {top.trendDescription === "New theme" ? "Brand new this period — " : ""}
          {ratioCopy}. {sharePct}% of every theme.
        </Text>
        <View
          style={{ marginTop: 10, flexDirection: "row", flexWrap: "wrap", gap: 6 }}
        >
          <Badge tone={top.tone}>{top.trendDescription}</Badge>
        </View>
      </View>
    </View>
  );
}

function HeroRing({
  share,
  count,
  tone,
}: {
  share: number;
  count: number;
  tone: SentimentTone;
}) {
  const g = SENTIMENT[tone];
  const size = 132;
  const cx = size / 2;
  const cy = size / 2;
  const r = 50;
  const trackR = 60;
  const circumference = 2 * Math.PI * r;
  const dash = circumference * Math.max(0.04, Math.min(1, share));

  const scale = useSharedValue(1);
  useEffect(() => {
    if (Platform.OS === "web") return;
    scale.value = withRepeat(
      withTiming(1.025, {
        duration: 1750,
        easing: Easing.inOut(Easing.ease),
      }),
      -1,
      true
    );
    return () => cancelAnimation(scale);
  }, [scale]);
  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <Defs>
          <SvgLinearGradient id="hero-ring" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0%" stopColor={g.from} />
            <Stop offset="55%" stopColor={g.via} />
            <Stop offset="100%" stopColor={g.to} />
          </SvgLinearGradient>
          <RadialGradient id="hero-fill" cx="50%" cy="50%" r="50%">
            <Stop offset="0%" stopColor={g.from} stopOpacity={0.22} />
            <Stop offset="80%" stopColor={g.from} stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id="hero-glow" cx="50%" cy="50%" r="50%">
            <Stop offset="0%" stopColor={g.from} stopOpacity={0.55} />
            <Stop offset="55%" stopColor={g.from} stopOpacity={0.1} />
            <Stop offset="100%" stopColor={g.from} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Circle cx={cx} cy={cy} r={size / 2} fill="url(#hero-glow)" />
        <Circle
          cx={cx}
          cy={cy}
          r={trackR}
          fill="none"
          stroke="rgba(255,255,255,0.04)"
          strokeWidth={1}
        />
        <Circle
          cx={cx}
          cy={cy}
          r={r}
          fill="url(#hero-fill)"
          stroke="rgba(255,255,255,0.06)"
          strokeWidth={8}
        />
        <Circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke="url(#hero-ring)"
          strokeWidth={8}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circumference - dash}`}
          transform={`rotate(-90 ${cx} ${cy})`}
        />
        {Array.from({ length: 24 }).map((_, i) => {
          const a = (i / 24) * Math.PI * 2;
          const x1 = cx + Math.cos(a) * (trackR + 3);
          const y1 = cy + Math.sin(a) * (trackR + 3);
          const x2 = cx + Math.cos(a) * (trackR + 7);
          const y2 = cy + Math.sin(a) * (trackR + 7);
          return (
            <Line
              key={i}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke="rgba(255,255,255,0.08)"
              strokeWidth={1}
            />
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
          },
          pulseStyle,
        ]}
      >
        <Text
          style={{
            fontSize: 34,
            fontWeight: "800",
            color: "#FAFAFA",
            letterSpacing: -1.2,
          }}
        >
          {count}
        </Text>
        <Text
          style={{
            fontSize: 9,
            marginTop: 2,
            fontWeight: "700",
            letterSpacing: 1.4,
            color: g.soft,
            textTransform: "uppercase",
          }}
        >
          mentions
        </Text>
      </Animated.View>
    </View>
  );
}

function Badge({
  children,
  tone,
}: {
  children: string;
  tone: SentimentTone;
}) {
  const g = SENTIMENT[tone];
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 5,
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 999,
        backgroundColor: `${g.from}24`,
        borderWidth: 1,
        borderColor: `${g.from}40`,
      }}
    >
      <View
        style={{
          width: 5,
          height: 5,
          borderRadius: 999,
          backgroundColor: g.from,
        }}
      />
      <Text
        style={{
          fontSize: 10,
          fontWeight: "700",
          color: g.soft,
          letterSpacing: 0.2,
        }}
      >
        {children}
      </Text>
    </View>
  );
}

// ─── Wave chart ─────────────────────────────────────────────────────

function WaveChart({ themes }: { themes: DashboardTheme[] }) {
  const { width: screenW } = useWindowDimensions();
  const W = Math.max(280, Math.min(600, screenW - 64));
  const H = 150;
  const PAD_X = 12;
  const PAD_TOP = 26;
  const PAD_BOT = 18;
  const innerW = W - PAD_X * 2;
  const innerH = H - PAD_TOP - PAD_BOT;
  const days = themes[0]?.sparkline.length ?? 30;
  const maxAcross = Math.max(1, ...themes.flatMap((t) => t.sparkline));

  const series = themes.map((t) => {
    const path = smoothPath(
      t.sparkline,
      innerW,
      innerH,
      PAD_X,
      PAD_TOP,
      maxAcross
    );
    return { theme: t, ...path };
  });
  const top = series[0];
  const peak = top
    ? findPeak(top.theme.sparkline, innerW, innerH, PAD_X, PAD_TOP, maxAcross)
    : null;

  return (
    <View
      style={{
        padding: 14,
        borderRadius: 18,
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.05)",
        backgroundColor: "rgba(255,255,255,0.02)",
      }}
    >
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "flex-end",
          marginBottom: 10,
        }}
      >
        <Text
          style={{
            fontSize: 9,
            letterSpacing: 2,
            fontWeight: "700",
            color: "rgba(228,228,231,0.55)",
            textTransform: "uppercase",
          }}
        >
          Trend · last {days} days
        </Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {themes.map((t) => (
            <View
              key={t.id}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 5,
              }}
            >
              <View
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: 999,
                  backgroundColor: SENTIMENT[t.tone].from,
                }}
              />
              <Text
                style={{
                  fontSize: 10,
                  color: "rgba(228,228,231,0.7)",
                }}
                numberOfLines={1}
              >
                {t.name}
              </Text>
            </View>
          ))}
        </View>
      </View>
      <Svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
        <Defs>
          {series.map((s, i) => {
            const g = SENTIMENT[s.theme.tone];
            return (
              <G key={s.theme.id}>
                <SvgLinearGradient
                  id={`stroke-${i}`}
                  x1="0"
                  y1="0"
                  x2="1"
                  y2="0"
                >
                  <Stop offset="0%" stopColor={g.from} />
                  <Stop offset="50%" stopColor={g.via} />
                  <Stop offset="100%" stopColor={g.to} />
                </SvgLinearGradient>
                <SvgLinearGradient
                  id={`fill-${i}`}
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <Stop offset="0%" stopColor={g.from} stopOpacity={0.22} />
                  <Stop offset="100%" stopColor={g.from} stopOpacity={0} />
                </SvgLinearGradient>
              </G>
            );
          })}
        </Defs>
        {[0.25, 0.5, 0.75].map((p) => {
          const y = PAD_TOP + innerH * p;
          return (
            <Line
              key={p}
              x1={PAD_X}
              x2={W - PAD_X}
              y1={y}
              y2={y}
              stroke="rgba(255,255,255,0.04)"
              strokeWidth={1}
            />
          );
        })}
        <Line
          x1={PAD_X}
          x2={W - PAD_X}
          y1={H - PAD_BOT}
          y2={H - PAD_BOT}
          stroke="rgba(255,255,255,0.08)"
          strokeWidth={1}
          strokeDasharray="2 4"
        />
        {series.map((s, i) => (
          <Path
            key={`f-${s.theme.id}`}
            d={s.area}
            fill={`url(#fill-${i})`}
          />
        ))}
        {series.map((s, i) => (
          <Path
            key={`l-${s.theme.id}`}
            d={s.line}
            fill="none"
            stroke={`url(#stroke-${i})`}
            strokeWidth={i === 0 ? 2.6 : 2}
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity={i === 0 ? 1 : 0.78}
          />
        ))}
        {peak && top && (
          <G>
            <Circle
              cx={peak.x}
              cy={peak.y}
              r={9}
              fill={SENTIMENT[top.theme.tone].from}
              opacity={0.18}
            />
            <Circle
              cx={peak.x}
              cy={peak.y}
              r={4.5}
              fill="#0A0A14"
              stroke={SENTIMENT[top.theme.tone].from}
              strokeWidth={2}
            />
            <G transform={`translate(${Math.min(peak.x, W - 88)}, ${Math.max(peak.y - 32, 2)})`}>
              <Rect
                x={0}
                y={0}
                width={84}
                height={26}
                rx={6}
                fill="rgba(10,10,20,0.92)"
                stroke={SENTIMENT[top.theme.tone].from}
                strokeOpacity={0.6}
                strokeWidth={1}
              />
              <SvgText
                x={7}
                y={11}
                fontSize={8}
                fill="rgba(228,228,231,0.6)"
                fontWeight="700"
              >
                PEAK
              </SvgText>
              <SvgText
                x={7}
                y={21}
                fontSize={10}
                fill="#FAFAFA"
                fontWeight="700"
              >
                +{peak.value} {top.theme.name}
              </SvgText>
            </G>
          </G>
        )}
      </Svg>
    </View>
  );
}

// ─── Tile grid ──────────────────────────────────────────────────────

function TileGrid({
  themes,
  onTap,
}: {
  themes: DashboardTheme[];
  onTap?: (id: string) => void;
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        flexWrap: "wrap",
        gap: 10,
      }}
    >
      {themes.map((t) => (
        <View
          key={t.id}
          style={{
            flexBasis: "48%",
            flexGrow: 1,
          }}
        >
          <Tile theme={t} onTap={onTap} />
        </View>
      ))}
    </View>
  );
}

function Tile({
  theme,
  onTap,
}: {
  theme: DashboardTheme;
  onTap?: (id: string) => void;
}) {
  const g = SENTIMENT[theme.tone];
  const W = 180;
  const H = 56;
  const max = Math.max(1, ...theme.sparkline);
  const { line, area } = smoothPath(theme.sparkline, W - 8, H - 8, 4, 4, max);

  const handlePress = () => {
    if (!onTap) return;
    if (Platform.OS !== "web") {
      Haptics.selectionAsync().catch(() => {});
    }
    onTap(theme.id);
  };

  return (
    <Pressable
      onPress={onTap ? handlePress : undefined}
      style={{
        padding: 14,
        borderRadius: 18,
        borderWidth: 1,
        borderColor: `${g.from}26`,
        backgroundColor: "rgba(20,20,30,0.6)",
        overflow: "hidden",
      }}
    >
      <Svg
        pointerEvents="none"
        style={{ position: "absolute", top: 0, left: 0 }}
        width="100%"
        height="100%"
      >
        <Defs>
          <SvgLinearGradient id={`tile-bg-${theme.id}`} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0%" stopColor={g.from} stopOpacity={0.18} />
            <Stop offset="60%" stopColor={g.to} stopOpacity={0.06} />
            <Stop offset="100%" stopColor="#0A0A14" stopOpacity={0} />
          </SvgLinearGradient>
        </Defs>
        <Rect
          x={0}
          y={0}
          width="100%"
          height="100%"
          fill={`url(#tile-bg-${theme.id})`}
        />
      </Svg>
      <Text
        style={{
          fontSize: 9,
          letterSpacing: 1.4,
          fontWeight: "700",
          color: g.soft,
          textTransform: "uppercase",
        }}
      >
        {theme.trendDescription}
      </Text>
      <Text
        style={{
          marginTop: 3,
          fontSize: 13,
          fontWeight: "600",
          color: "rgba(244,244,245,0.92)",
          letterSpacing: -0.1,
        }}
        numberOfLines={1}
      >
        {capitalize(theme.name)}
      </Text>
      <View
        style={{
          marginTop: 6,
          flexDirection: "row",
          alignItems: "flex-end",
          justifyContent: "space-between",
          gap: 6,
        }}
      >
        <Text
          style={{
            fontSize: 28,
            fontWeight: "800",
            color: "#FAFAFA",
            letterSpacing: -0.8,
            lineHeight: 30,
          }}
        >
          {theme.mentionCount}
        </Text>
        <Svg width={W * 0.55} height={28} viewBox={`0 0 ${W} ${H}`}>
          <Defs>
            <SvgLinearGradient
              id={`tile-stroke-${theme.id}`}
              x1="0"
              y1="0"
              x2="1"
              y2="0"
            >
              <Stop offset="0%" stopColor={g.from} />
              <Stop offset="100%" stopColor={g.to} />
            </SvgLinearGradient>
            <SvgLinearGradient
              id={`tile-fill-${theme.id}`}
              x1="0"
              y1="0"
              x2="0"
              y2="1"
            >
              <Stop offset="0%" stopColor={g.from} stopOpacity={0.4} />
              <Stop offset="100%" stopColor={g.from} stopOpacity={0} />
            </SvgLinearGradient>
          </Defs>
          <Path d={area} fill={`url(#tile-fill-${theme.id})`} />
          <Path
            d={line}
            fill="none"
            stroke={`url(#tile-stroke-${theme.id})`}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </Svg>
      </View>
    </Pressable>
  );
}

// ─── Frequency spectrum ────────────────────────────────────────────

function FrequencySpectrum({ themes }: { themes: DashboardTheme[] }) {
  const max = Math.max(1, ...themes.map((t) => t.mentionCount));
  return (
    <View
      style={{
        padding: 14,
        borderRadius: 18,
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.05)",
        backgroundColor: "rgba(255,255,255,0.02)",
      }}
    >
      <Text
        style={{
          fontSize: 9,
          letterSpacing: 2,
          fontWeight: "700",
          color: "rgba(228,228,231,0.55)",
          textTransform: "uppercase",
          marginBottom: 10,
        }}
      >
        Also mentioned
      </Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 8, paddingBottom: 4 }}
      >
        {themes.map((t) => {
          const g = SENTIMENT[t.tone];
          const h = 12 + (t.mentionCount / max) * 60;
          return (
            <View key={t.id} style={{ alignItems: "center", width: 56 }}>
              <View
                style={{
                  width: "100%",
                  height: h,
                  borderTopLeftRadius: 6,
                  borderTopRightRadius: 6,
                  overflow: "hidden",
                }}
              >
                <Svg width="100%" height="100%">
                  <Defs>
                    <SvgLinearGradient
                      id={`spec-${t.id}`}
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
                      <Stop offset="0%" stopColor={g.from} />
                      <Stop offset="60%" stopColor={g.via} />
                      <Stop offset="100%" stopColor={g.to} stopOpacity={0.4} />
                    </SvgLinearGradient>
                  </Defs>
                  <Rect
                    x={0}
                    y={0}
                    width="100%"
                    height="100%"
                    fill={`url(#spec-${t.id})`}
                  />
                  <SvgText
                    x="50%"
                    y={14}
                    fontSize={10}
                    fontWeight="700"
                    textAnchor="middle"
                    fill="rgba(10,10,20,0.85)"
                  >
                    {t.mentionCount}
                  </SvgText>
                </Svg>
              </View>
              <Text
                numberOfLines={1}
                style={{
                  marginTop: 6,
                  fontSize: 9,
                  textAlign: "center",
                  color: "rgba(228,228,231,0.62)",
                  width: 56,
                }}
              >
                {t.name}
              </Text>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

// ─── Geometry helpers ──────────────────────────────────────────────

function smoothPath(
  values: number[],
  width: number,
  height: number,
  padX: number,
  padY: number,
  maxOverride?: number
): { line: string; area: string } {
  const n = values.length;
  if (n === 0) return { line: "", area: "" };
  const max = maxOverride ?? Math.max(1, ...values);
  const points = values.map((v, i) => {
    const x = padX + (i / Math.max(1, n - 1)) * width;
    const y = padY + height - (v / max) * height;
    return [x, y] as [number, number];
  });

  let line = `M ${points[0][0]} ${points[0][1]}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    line += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p2[0]} ${p2[1]}`;
  }

  const area =
    `${line} L ${points[points.length - 1][0]} ${padY + height} ` +
    `L ${points[0][0]} ${padY + height} Z`;
  return { line, area };
}

function findPeak(
  values: number[],
  width: number,
  height: number,
  padX: number,
  padY: number,
  maxOverride?: number
): { x: number; y: number; value: number } | null {
  if (values.length === 0) return null;
  let max = -1;
  let idx = 0;
  for (let i = 0; i < values.length; i++) {
    if (values[i] > max) {
      max = values[i];
      idx = i;
    }
  }
  if (max <= 0) return null;
  const m = maxOverride ?? Math.max(1, ...values);
  const x = padX + (idx / Math.max(1, values.length - 1)) * width;
  const y = padY + height - (max / m) * height;
  return { x, y, value: max };
}

function capitalize(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}
