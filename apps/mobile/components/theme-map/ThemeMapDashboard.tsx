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
  FeGaussianBlur,
  FeMerge,
  FeMergeNode,
  Filter,
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
 * Visual vocabulary matches the reference screenshots:
 *   - Strokes glow via SVG <Filter> + <FeGaussianBlur> halo, 3pt
 *     stroke weight so they read as light not as hairlines.
 *   - Hero count is 56pt 800-weight — typographic centerpiece.
 *   - Cards have a top-edge highlight via Rect overlays for inner
 *     light, plus an outer shadow tint.
 *
 * Low-data behaviour:
 *   - Wave with <5 active days renders a dashed baseline + dot
 *     markers at recording dates + soft caption "your trend fills in
 *     as you record".
 *   - Tile sparkline with <2 active points renders an em-dash.
 *   - Wave callout pill auto-anchors LEFT of the dot if the peak is
 *     in the right 30% of chart width.
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
    glow: "rgba(251,146,60,0.55)",
    soft: "#FCD34D",
  },
  neutral: {
    from: "#A78BFA",
    via: "#60A5FA",
    to: "#22D3EE",
    glow: "rgba(96,165,250,0.55)",
    soft: "#93C5FD",
  },
  challenging: {
    from: "#F472B6",
    via: "#FB7185",
    to: "#F87171",
    glow: "rgba(244,114,182,0.55)",
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
        overflow: "hidden",
      }}
    >
      <PageBackground tone={top.tone} />
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

// ─── Background + atmosphere ──────────────────────────────────────

function PageBackground({ tone: _tone }: { tone: SentimentTone }) {
  // Vertical page gradient — slight lift at top, deep at bottom.
  return (
    <Svg
      pointerEvents="none"
      style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
      width="100%"
      height="100%"
      preserveAspectRatio="none"
    >
      <Defs>
        <SvgLinearGradient id="page-bg" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0%" stopColor="#0E0E1C" />
          <Stop offset="60%" stopColor="#08080F" />
          <Stop offset="100%" stopColor="#06060D" />
        </SvgLinearGradient>
      </Defs>
      <Rect x="0" y="0" width="100%" height="100%" fill="url(#page-bg)" />
    </Svg>
  );
}

function Atmosphere({ tone }: { tone: SentimentTone }) {
  const g = SENTIMENT[tone];
  return (
    <Svg
      pointerEvents="none"
      style={{ position: "absolute", top: -50, left: 0, right: 0, height: 380 }}
      width="100%"
      height={380}
      preserveAspectRatio="none"
    >
      <Defs>
        <RadialGradient id="bg-glow" cx="50%" cy="20%" r="70%">
          <Stop offset="0%" stopColor={g.from} stopOpacity={0.32} />
          <Stop offset="35%" stopColor={g.via} stopOpacity={0.16} />
          <Stop offset="70%" stopColor={g.to} stopOpacity={0.05} />
          <Stop offset="100%" stopColor={g.from} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Rect x="0" y="0" width="100%" height="100%" fill="url(#bg-glow)" />
    </Svg>
  );
}

// ─── Card chrome ──────────────────────────────────────────────────

const cardStyle = {
  backgroundColor: "rgba(255,255,255,0.02)",
  borderWidth: 1,
  borderColor: "rgba(255,255,255,0.06)",
  borderRadius: 18,
} as const;

function CardTopHighlight() {
  // 1px lighter strip at the top edge of every card, faking an inner
  // highlight in the absence of CSS box-shadow on RN Views.
  return (
    <View
      pointerEvents="none"
      style={{
        position: "absolute",
        top: 0,
        left: 1,
        right: 1,
        height: 1,
        backgroundColor: "rgba(255,255,255,0.07)",
      }}
    />
  );
}

// ─── Hero ring + narrative ───────────────────────────────────────

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
        ...cardStyle,
        flexDirection: "row",
        alignItems: "center",
        gap: 14,
        padding: 16,
      }}
    >
      <CardTopHighlight />
      <HeroRing share={share} count={top.mentionCount} tone={top.tone} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text
          style={{
            fontSize: 9,
            letterSpacing: 2.2,
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
            letterSpacing: -0.3,
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
          {ratioCopy}.{" "}
          <Text style={{ color: g.soft, fontWeight: "600" }}>
            {sharePct}%
          </Text>{" "}
          of every theme.
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
  const size = 148;
  const cx = size / 2;
  const cy = size / 2;
  const r = 56;
  const trackR = 67;
  const circumference = 2 * Math.PI * r;
  const dash = circumference * Math.max(0.04, Math.min(1, share));

  const pulseScale = useSharedValue(1);
  const haloScale = useSharedValue(1);
  useEffect(() => {
    if (Platform.OS === "web") return;
    pulseScale.value = withRepeat(
      withTiming(1.025, {
        duration: 1750,
        easing: Easing.inOut(Easing.ease),
      }),
      -1,
      true
    );
    haloScale.value = withRepeat(
      withTiming(1.06, {
        duration: 4500,
        easing: Easing.inOut(Easing.ease),
      }),
      -1,
      true
    );
    return () => {
      cancelAnimation(pulseScale);
      cancelAnimation(haloScale);
    };
  }, [pulseScale, haloScale]);

  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale.value }],
  }));
  const haloStyle = useAnimatedStyle(() => ({
    transform: [{ scale: haloScale.value }],
  }));

  return (
    <View style={{ width: size, height: size }}>
      {/* outer halo glow */}
      <Animated.View
        pointerEvents="none"
        style={[
          { position: "absolute", inset: 0 } as object,
          haloStyle,
        ]}
      >
        <Svg width={size} height={size}>
          <Defs>
            <RadialGradient id="hero-halo" cx="50%" cy="50%" r="50%">
              <Stop offset="0%" stopColor={g.from} stopOpacity={0.55} />
              <Stop offset="40%" stopColor={g.from} stopOpacity={0.2} />
              <Stop offset="100%" stopColor={g.from} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Circle cx={cx} cy={cy} r={size / 2} fill="url(#hero-halo)" />
        </Svg>
      </Animated.View>

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
          <Filter
            id="hero-glow"
            x="-30%"
            y="-30%"
            width="160%"
            height="160%"
          >
            <FeGaussianBlur stdDeviation="2.6" />
            <FeMerge>
              <FeMergeNode in="blur" />
              <FeMergeNode in="SourceGraphic" />
            </FeMerge>
          </Filter>
        </Defs>
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
          strokeWidth={9}
        />
        <Circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke="url(#hero-ring)"
          strokeWidth={9}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circumference - dash}`}
          transform={`rotate(-90 ${cx} ${cy})`}
          filter="url(#hero-glow)"
        />
        {Array.from({ length: 28 }).map((_, i) => {
          const a = (i / 28) * Math.PI * 2;
          const x1 = cx + Math.cos(a) * (trackR + 3);
          const y1 = cy + Math.sin(a) * (trackR + 3);
          const x2 = cx + Math.cos(a) * (trackR + 8);
          const y2 = cy + Math.sin(a) * (trackR + 8);
          return (
            <Line
              key={i}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke="rgba(255,255,255,0.09)"
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
          } as object,
          pulseStyle,
        ]}
      >
        <Text
          style={{
            fontSize: 56,
            fontWeight: "800",
            color: "#FAFAFA",
            letterSpacing: -2,
            lineHeight: 58,
            textShadowColor: g.glow,
            textShadowRadius: 18,
          }}
        >
          {count}
        </Text>
        <Text
          style={{
            fontSize: 9,
            marginTop: 4,
            fontWeight: "700",
            letterSpacing: 1.6,
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
        backgroundColor: `${g.from}30`,
        borderWidth: 1,
        borderColor: `${g.from}55`,
        shadowColor: g.from,
        shadowOpacity: 0.5,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 0 },
      }}
    >
      <View
        style={{
          width: 6,
          height: 6,
          borderRadius: 999,
          backgroundColor: g.from,
          shadowColor: g.from,
          shadowOpacity: 1,
          shadowRadius: 4,
          shadowOffset: { width: 0, height: 0 },
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

// ─── Wave chart with low-data state ───────────────────────────────

function WaveChart({ themes }: { themes: DashboardTheme[] }) {
  const { width: screenW } = useWindowDimensions();
  const W = Math.max(280, Math.min(600, screenW - 64));
  const H = 170;
  const PAD_X = 14;
  const PAD_TOP = 30;
  const PAD_BOT = 22;
  const innerW = W - PAD_X * 2;
  const innerH = H - PAD_TOP - PAD_BOT;
  const days = themes[0]?.sparkline.length ?? 30;
  const maxAcross = Math.max(1, ...themes.flatMap((t) => t.sparkline));
  const combinedActive = countActiveDays(
    themes.flatMap((t) => t.sparkline),
    days
  );
  const isLowData = combinedActive < 5;

  return (
    <View style={{ ...cardStyle, padding: 14 }}>
      <CardTopHighlight />
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
            letterSpacing: 2.2,
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
                  shadowColor: SENTIMENT[t.tone].from,
                  shadowOpacity: 0.9,
                  shadowRadius: 4,
                  shadowOffset: { width: 0, height: 0 },
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
      <View>
        <Svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
          <Defs>
            <Filter id="wave-glow" x="-20%" y="-50%" width="140%" height="200%">
              <FeGaussianBlur stdDeviation="2.2" />
              <FeMerge>
                <FeMergeNode in="blur" />
                <FeMergeNode in="SourceGraphic" />
              </FeMerge>
            </Filter>
            {themes.map((t, i) => {
              const g = SENTIMENT[t.tone];
              return (
                <G key={t.id}>
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
                    <Stop offset="0%" stopColor={g.from} stopOpacity={0.34} />
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
            stroke="rgba(255,255,255,0.1)"
            strokeWidth={1}
            strokeDasharray={isLowData ? "4 6" : "2 4"}
          />

          {isLowData ? (
            <LowDataMarkers
              themes={themes}
              days={days}
              W={W}
              H={H}
              PAD_X={PAD_X}
              PAD_BOT={PAD_BOT}
            />
          ) : (
            <FullWavePaths
              themes={themes}
              W={W}
              H={H}
              PAD_X={PAD_X}
              PAD_TOP={PAD_TOP}
              innerW={innerW}
              innerH={innerH}
              maxAcross={maxAcross}
            />
          )}
        </Svg>
        {isLowData && (
          <Text
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: 6,
              textAlign: "center",
              fontSize: 10,
              letterSpacing: 0.5,
              color: "rgba(228,228,231,0.5)",
            }}
          >
            Your trend fills in as you record.
          </Text>
        )}
      </View>
    </View>
  );
}

function FullWavePaths({
  themes,
  W,
  H,
  PAD_X,
  PAD_TOP,
  innerW,
  innerH,
  maxAcross,
}: {
  themes: DashboardTheme[];
  W: number;
  H: number;
  PAD_X: number;
  PAD_TOP: number;
  innerW: number;
  innerH: number;
  maxAcross: number;
}) {
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

  const PILL_W = 92;
  const PILL_H = 28;
  let pillX = 0;
  let pillY = 0;
  let connectorX = 0;
  if (peak) {
    const anchorRight = peak.x > W - PAD_X - PILL_W - 22;
    pillX = anchorRight ? peak.x - PILL_W - 12 : peak.x + 12;
    pillY = Math.max(4, Math.min(peak.y - PILL_H / 2 - 16, H - PILL_H - 4));
    connectorX = anchorRight ? peak.x - 6 : peak.x + 6;
  }

  return (
    <G>
      {series.map((s, i) => (
        <Path key={`f-${s.theme.id}`} d={s.area} fill={`url(#fill-${i})`} />
      ))}
      {series.map((s, i) => (
        <Path
          key={`l-${s.theme.id}`}
          d={s.line}
          fill="none"
          stroke={`url(#stroke-${i})`}
          strokeWidth={i === 0 ? 3 : 2.4}
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={i === 0 ? 1 : 0.78}
          filter="url(#wave-glow)"
        />
      ))}
      {peak && top && (
        <G>
          <Line
            x1={peak.x}
            y1={peak.y}
            x2={connectorX}
            y2={pillY + PILL_H / 2}
            stroke={SENTIMENT[top.theme.tone].from}
            strokeOpacity={0.5}
            strokeWidth={1}
          />
          <Circle
            cx={peak.x}
            cy={peak.y}
            r={10}
            fill={SENTIMENT[top.theme.tone].from}
            opacity={0.22}
          />
          <Circle
            cx={peak.x}
            cy={peak.y}
            r={5}
            fill={SENTIMENT[top.theme.tone].from}
            stroke="#FAFAFA"
            strokeWidth={1.5}
          />
          <G transform={`translate(${pillX}, ${pillY})`}>
            <Rect
              x={0}
              y={0}
              width={PILL_W}
              height={PILL_H}
              rx={7}
              fill={`${SENTIMENT[top.theme.tone].from}28`}
              stroke={SENTIMENT[top.theme.tone].from}
              strokeOpacity={0.7}
              strokeWidth={1}
            />
            <SvgText
              x={8}
              y={11}
              fontSize={8}
              fill={SENTIMENT[top.theme.tone].soft}
              fontWeight="700"
            >
              PEAK
            </SvgText>
            <SvgText
              x={8}
              y={22}
              fontSize={10}
              fill="#FAFAFA"
              fontWeight="700"
            >
              +{peak.value} {top.theme.name}
            </SvgText>
          </G>
        </G>
      )}
    </G>
  );
}

function LowDataMarkers({
  themes,
  days,
  W,
  H,
  PAD_X,
  PAD_BOT,
}: {
  themes: DashboardTheme[];
  days: number;
  W: number;
  H: number;
  PAD_X: number;
  PAD_BOT: number;
}) {
  const baselineY = H - PAD_BOT;
  const innerW = W - PAD_X * 2;
  return (
    <G>
      {themes.flatMap((t) =>
        t.sparkline
          .map((v, i) => {
            if (v <= 0) return null;
            const x = PAD_X + (i / Math.max(1, days - 1)) * innerW;
            const dotY = baselineY - 12 - v * 4;
            const g = SENTIMENT[t.tone];
            return (
              <G key={`${t.id}-${i}`}>
                <Line
                  x1={x}
                  y1={baselineY}
                  x2={x}
                  y2={dotY}
                  stroke={g.from}
                  strokeOpacity={0.28}
                  strokeWidth={1.5}
                />
                <Circle cx={x} cy={dotY} r={9} fill={g.from} opacity={0.18} />
                <Circle cx={x} cy={dotY} r={4} fill={g.from} />
              </G>
            );
          })
          .filter((node): node is JSX.Element => node !== null)
      )}
    </G>
  );
}

// ─── Tile grid ───────────────────────────────────────────────────

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
      {themes.map((t, i) => (
        <View
          key={t.id}
          style={{
            flexBasis: "48%",
            flexGrow: 1,
          }}
        >
          <Tile theme={t} onTap={onTap} isTop={i === 0} />
        </View>
      ))}
    </View>
  );
}

function Tile({
  theme,
  onTap,
  isTop,
}: {
  theme: DashboardTheme;
  onTap?: (id: string) => void;
  isTop: boolean;
}) {
  const g = SENTIMENT[theme.tone];
  const W = 180;
  const H = 56;
  const max = Math.max(1, ...theme.sparkline);
  const activePoints = theme.sparkline.filter((v) => v > 0).length;
  const showSparkline = activePoints >= 2;
  const { line, area } = showSparkline
    ? smoothPath(theme.sparkline, W - 8, H - 8, 4, 4, max)
    : { line: "", area: "" };

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
        borderColor: `${g.from}40`,
        overflow: "hidden",
        shadowColor: g.from,
        shadowOpacity: 0.4,
        shadowRadius: 18,
        shadowOffset: { width: 0, height: 12 },
      }}
    >
      {/* layered backgrounds — outer + inner sentiment overlay */}
      <Svg
        pointerEvents="none"
        style={{ position: "absolute", top: 0, left: 0 }}
        width="100%"
        height="100%"
      >
        <Defs>
          <SvgLinearGradient
            id={`tile-bg-${theme.id}`}
            x1="0"
            y1="0"
            x2="1"
            y2="1"
          >
            <Stop offset="0%" stopColor={g.from} stopOpacity={0.26} />
            <Stop offset="50%" stopColor={g.via} stopOpacity={0.1} />
            <Stop offset="100%" stopColor="#0A0A14" stopOpacity={0.7} />
          </SvgLinearGradient>
          <RadialGradient id={`tile-glow-${theme.id}`} cx="100%" cy="0%" r="80%">
            <Stop offset="0%" stopColor={g.from} stopOpacity={0.45} />
            <Stop offset="100%" stopColor={g.from} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect
          x={0}
          y={0}
          width="100%"
          height="100%"
          fill={`url(#tile-bg-${theme.id})`}
        />
        <Rect
          x={0}
          y={0}
          width="100%"
          height="100%"
          fill={`url(#tile-glow-${theme.id})`}
        />
      </Svg>
      <CardTopHighlight />

      {/* trend label with sentiment dot */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        <View
          style={{
            width: 6,
            height: 6,
            borderRadius: 999,
            backgroundColor: g.from,
            shadowColor: g.from,
            shadowOpacity: 1,
            shadowRadius: 5,
            shadowOffset: { width: 0, height: 0 },
          }}
        />
        <Text
          style={{
            fontSize: 9,
            letterSpacing: 1.6,
            fontWeight: "700",
            color: g.soft,
            textTransform: "uppercase",
          }}
        >
          {theme.trendDescription}
        </Text>
      </View>

      <Text
        style={{
          marginTop: 3,
          fontSize: 13,
          fontWeight: "600",
          color: isTop ? g.soft : "rgba(244,244,245,0.95)",
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
            fontSize: 36,
            fontWeight: "800",
            color: "#FAFAFA",
            letterSpacing: -1.2,
            lineHeight: 38,
            textShadowColor: g.glow,
            textShadowRadius: 14,
          }}
        >
          {theme.mentionCount}
        </Text>
        {showSparkline ? (
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
                <Stop offset="0%" stopColor={g.from} stopOpacity={0.5} />
                <Stop offset="100%" stopColor={g.from} stopOpacity={0} />
              </SvgLinearGradient>
              <Filter
                id={`tile-glow-stroke-${theme.id}`}
                x="-20%"
                y="-50%"
                width="140%"
                height="200%"
              >
                <FeGaussianBlur stdDeviation="1.4" />
                <FeMerge>
                  <FeMergeNode in="blur" />
                  <FeMergeNode in="SourceGraphic" />
                </FeMerge>
              </Filter>
            </Defs>
            <Path d={area} fill={`url(#tile-fill-${theme.id})`} />
            <Path
              d={line}
              fill="none"
              stroke={`url(#tile-stroke-${theme.id})`}
              strokeWidth={2.2}
              strokeLinecap="round"
              strokeLinejoin="round"
              filter={`url(#tile-glow-stroke-${theme.id})`}
            />
          </Svg>
        ) : (
          <Text
            style={{
              flex: 1,
              maxWidth: 110,
              textAlign: "right",
              fontSize: 22,
              fontWeight: "600",
              color: `${g.from}99`,
              letterSpacing: 1,
            }}
            accessibilityLabel="Not enough data yet"
          >
            —
          </Text>
        )}
      </View>
    </Pressable>
  );
}

// ─── Frequency spectrum ──────────────────────────────────────────

function FrequencySpectrum({ themes }: { themes: DashboardTheme[] }) {
  const max = Math.max(1, ...themes.map((t) => t.mentionCount));
  return (
    <View style={{ ...cardStyle, padding: 14 }}>
      <CardTopHighlight />
      <Text
        style={{
          fontSize: 9,
          letterSpacing: 2.2,
          fontWeight: "700",
          color: "rgba(228,228,231,0.55)",
          textTransform: "uppercase",
          marginBottom: 12,
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
          const h = 16 + (t.mentionCount / max) * 64;
          return (
            <View key={t.id} style={{ alignItems: "center", width: 56 }}>
              <View
                style={{
                  width: "100%",
                  height: h,
                  borderTopLeftRadius: 6,
                  borderTopRightRadius: 6,
                  overflow: "hidden",
                  shadowColor: g.from,
                  shadowOpacity: 0.6,
                  shadowRadius: 10,
                  shadowOffset: { width: 0, height: -4 },
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
                      <Stop offset="100%" stopColor={g.to} stopOpacity={0.45} />
                    </SvgLinearGradient>
                  </Defs>
                  <Rect
                    x={0}
                    y={0}
                    width="100%"
                    height="100%"
                    fill={`url(#spec-${t.id})`}
                  />
                  {/* top highlight */}
                  <Rect
                    x={0}
                    y={0}
                    width="100%"
                    height={1}
                    fill="rgba(255,255,255,0.35)"
                  />
                  <SvgText
                    x="50%"
                    y={14}
                    fontSize={10}
                    fontWeight="800"
                    textAnchor="middle"
                    fill="rgba(10,10,20,0.9)"
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

// ─── Geometry helpers ────────────────────────────────────────────

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

function countActiveDays(allValues: number[], days: number): number {
  if (days <= 0) return 0;
  const active = new Set<number>();
  for (let i = 0; i < allValues.length; i++) {
    if (allValues[i] > 0) active.add(i % days);
  }
  return active.size;
}

function capitalize(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}
