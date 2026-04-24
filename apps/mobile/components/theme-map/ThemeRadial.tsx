import * as Haptics from "expo-haptics";
import { useEffect, useMemo, useState } from "react";
import {
  AccessibilityInfo,
  Platform,
  Pressable,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from "react-native-reanimated";
import Svg, {
  Circle,
  Defs,
  LinearGradient as SvgLinearGradient,
  RadialGradient,
  Rect,
  Stop,
} from "react-native-svg";

/**
 * Theme Radial — radial / ring geometry visualization of recurring
 * themes. Three rank bands, each with its own geometry:
 *
 *   Rank 1     → Hero ring card (220pt ring on a 320pt gradient card,
 *                mention count inside, theme name below, share-of-all
 *                stat in the corner). Ring arc sweeps proportionally
 *                to the hero's share of total mentions.
 *   Ranks 2–5  → 2×2 grid of "ring stat" cards. Each card has a 72pt
 *                ring on the left showing that theme's count as a
 *                fraction of the top theme's count, with the theme
 *                name + mention count on the right.
 *   Ranks 6+   → Arc rows. A 34pt ring on the left encodes relative
 *                share; theme name in the middle, count on the right.
 *                Cheap to render — scales to 30+ themes.
 *
 * Sentiment drives the arc gradient stops:
 *   positive    → emerald  (#34D399 → #6EE7B7)
 *   neutral     → indigo   (#818CF8 → #A5B4FC)
 *   challenging → rose     (#FB7185 → #FDA4AF)
 *
 * Entry: staggered fade + slide (translateY 14 → 0), 360ms / 45ms
 * stagger, ease-out cubic. ReduceMotion bypasses.
 *
 * Rejected predecessors:
 *   - Orbiting constellation (clipped edges, cramped labels)
 *   - Bubble cluster w/ d3-force (overlapping labels, saturated hue)
 *   - Editorial gallery (rectangular cards — "list of colored boxes")
 */

type SentimentTone = "positive" | "challenging" | "neutral";

export type RadialTheme = {
  id: string;
  name: string;
  mentionCount: number;
  tone: SentimentTone;
};

type ToneSpec = {
  bgStart: string;
  bgEnd: string;
  ringStart: string;
  ringEnd: string;
  accent: string;
  glow: string;
  numberFg: string;
};

const TONE: Record<SentimentTone, ToneSpec> = {
  positive: {
    bgStart: "#064E3B",
    bgEnd: "#022C22",
    ringStart: "#34D399",
    ringEnd: "#6EE7B7",
    accent: "#6EE7B7",
    glow: "#34D399",
    numberFg: "#D1FAE5",
  },
  neutral: {
    bgStart: "#1E1B4B",
    bgEnd: "#0F0D2E",
    ringStart: "#818CF8",
    ringEnd: "#A5B4FC",
    accent: "#A5B4FC",
    glow: "#818CF8",
    numberFg: "#DBEAFE",
  },
  challenging: {
    bgStart: "#881337",
    bgEnd: "#500724",
    ringStart: "#FB7185",
    ringEnd: "#FDA4AF",
    accent: "#FDA4AF",
    glow: "#FB7185",
    numberFg: "#FECDD3",
  },
};

function useReduceMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then((v) => {
      if (mounted) setReduced(v);
    });
    const sub = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      setReduced
    );
    return () => {
      mounted = false;
      sub.remove();
    };
  }, []);
  return reduced;
}

function sentenceCase(s: string): string {
  if (!s) return s;
  const lower = s.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

function tapHaptic(): void {
  if (Platform.OS !== "ios") return;
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}

export function ThemeRadial({
  themes,
  onTap,
  replayToken = 0,
}: {
  themes: RadialTheme[];
  onTap?: (id: string) => void;
  replayToken?: number | string;
}) {
  const { width: screenWidth } = useWindowDimensions();
  const reduceMotion = useReduceMotion();

  const { hero, satellites, rest, heroShare, topCount } = useMemo(() => {
    const hero = themes[0] ?? null;
    const satellites = themes.slice(1, 5);
    const rest = themes.slice(5);
    const total = themes.reduce((s, t) => s + t.mentionCount, 0);
    const heroShare =
      hero && total > 0 ? hero.mentionCount / total : 0;
    const topCount = hero?.mentionCount ?? 1;
    return { hero, satellites, rest, heroShare, topCount };
  }, [themes]);

  if (!hero) return null;

  const handleTap = (id: string) => {
    tapHaptic();
    onTap?.(id);
  };

  const gutter = 20;
  const contentWidth = screenWidth - gutter * 2;
  const satCardWidth = (contentWidth - 10) / 2;

  return (
    <View style={{ paddingHorizontal: gutter }}>
      <HeroRing
        theme={hero}
        share={heroShare}
        onPress={() => handleTap(hero.id)}
        index={0}
        replayToken={replayToken}
        reduceMotion={reduceMotion}
      />

      {satellites.length > 0 && (
        <View
          style={{
            marginTop: 12,
            flexDirection: "row",
            flexWrap: "wrap",
            gap: 10,
          }}
        >
          {satellites.map((t, i) => (
            <SatelliteRing
              key={t.id}
              theme={t}
              rank={i + 2}
              topCount={topCount}
              width={satCardWidth}
              index={i + 1}
              onPress={() => handleTap(t.id)}
              replayToken={replayToken}
              reduceMotion={reduceMotion}
            />
          ))}
        </View>
      )}

      {rest.length > 0 && (
        <View style={{ marginTop: 18 }}>
          {rest.map((t, i) => (
            <ArcRow
              key={t.id}
              theme={t}
              topCount={topCount}
              index={i + 5}
              onPress={() => handleTap(t.id)}
              replayToken={replayToken}
              reduceMotion={reduceMotion}
            />
          ))}
        </View>
      )}
    </View>
  );
}

function useEntryAnim(
  index: number,
  replayToken: number | string,
  reduceMotion: boolean
) {
  const opacity = useSharedValue(reduceMotion ? 1 : 0);
  const translateY = useSharedValue(reduceMotion ? 0 : 14);

  useEffect(() => {
    if (reduceMotion) {
      opacity.value = 1;
      translateY.value = 0;
      return;
    }
    opacity.value = 0;
    translateY.value = 14;
    const delay = Math.min(index * 45, 520);
    opacity.value = withDelay(
      delay,
      withTiming(1, { duration: 360, easing: Easing.out(Easing.cubic) })
    );
    translateY.value = withDelay(
      delay,
      withTiming(0, { duration: 360, easing: Easing.out(Easing.cubic) })
    );
  }, [index, replayToken, reduceMotion, opacity, translateY]);

  return useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));
}

/**
 * Ring — progress arc that sweeps clockwise from 12 o'clock.
 * `share` is clamped to [minShare, 1] so small shares still read as
 * a visible arc (a 4% share at 0.04 would be invisible).
 */
function Ring({
  size,
  stroke,
  share,
  tone,
  gradientId,
  minShare = 0.08,
  showGlow = true,
}: {
  size: number;
  stroke: number;
  share: number;
  tone: SentimentTone;
  gradientId: string;
  minShare?: number;
  showGlow?: boolean;
}) {
  const t = TONE[tone];
  const cx = size / 2;
  const cy = size / 2;
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const sweepPct = Math.max(minShare, Math.min(share, 1));
  const sweepLen = circumference * sweepPct;
  const gapLen = circumference - sweepLen;

  return (
    <Svg width={size} height={size}>
      <Defs>
        <SvgLinearGradient
          id={gradientId}
          x1="0"
          y1="0"
          x2="1"
          y2="1"
        >
          <Stop offset="0%" stopColor={t.ringStart} stopOpacity={1} />
          <Stop offset="100%" stopColor={t.ringEnd} stopOpacity={1} />
        </SvgLinearGradient>
      </Defs>

      <Circle
        cx={cx}
        cy={cy}
        r={r}
        stroke="rgba(255,255,255,0.08)"
        strokeWidth={stroke}
        fill="none"
      />

      {showGlow && (
        <Circle
          cx={cx}
          cy={cy}
          r={r}
          stroke={t.glow}
          strokeWidth={stroke + 8}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={`${sweepLen} ${gapLen}`}
          strokeDashoffset={0}
          transform={`rotate(-90 ${cx} ${cy})`}
          opacity={0.16}
        />
      )}

      <Circle
        cx={cx}
        cy={cy}
        r={r}
        stroke={`url(#${gradientId})`}
        strokeWidth={stroke}
        strokeLinecap="round"
        fill="none"
        strokeDasharray={`${sweepLen} ${gapLen}`}
        strokeDashoffset={0}
        transform={`rotate(-90 ${cx} ${cy})`}
      />
    </Svg>
  );
}

function HeroRing({
  theme,
  share,
  onPress,
  index,
  replayToken,
  reduceMotion,
}: {
  theme: RadialTheme;
  share: number;
  onPress: () => void;
  index: number;
  replayToken: number | string;
  reduceMotion: boolean;
}) {
  const animStyle = useEntryAnim(index, replayToken, reduceMotion);
  const tone = TONE[theme.tone];

  const ringSize = 220;
  const ringStroke = 14;

  return (
    <Animated.View style={animStyle}>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`${theme.name}, top theme, ${theme.mentionCount} mentions`}
        style={{
          height: 340,
          borderRadius: 28,
          overflow: "hidden",
          borderWidth: 1,
          borderColor: "rgba(255,255,255,0.08)",
          shadowColor: tone.glow,
          shadowOffset: { width: 0, height: 14 },
          shadowRadius: 32,
          shadowOpacity: 0.34,
          elevation: 10,
        }}
      >
        <Svg
          width="100%"
          height="100%"
          style={{ position: "absolute", inset: 0 }}
          pointerEvents="none"
        >
          <Defs>
            <RadialGradient id="hero-radial-bg" cx="80%" cy="12%" r="100%">
              <Stop offset="0%" stopColor={tone.glow} stopOpacity={0.42} />
              <Stop offset="55%" stopColor={tone.bgStart} stopOpacity={0.95} />
              <Stop offset="100%" stopColor={tone.bgEnd} stopOpacity={1} />
            </RadialGradient>
            <RadialGradient id="hero-radial-glow" cx="15%" cy="95%" r="70%">
              <Stop offset="0%" stopColor={tone.accent} stopOpacity={0.22} />
              <Stop offset="100%" stopColor={tone.bgEnd} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Rect
            x="0"
            y="0"
            width="100%"
            height="100%"
            fill="url(#hero-radial-bg)"
          />
          <Rect
            x="0"
            y="0"
            width="100%"
            height="100%"
            fill="url(#hero-radial-glow)"
          />
        </Svg>

        {/* Top-left pill: TOP THEME */}
        <View
          style={{
            position: "absolute",
            top: 18,
            left: 20,
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            paddingHorizontal: 10,
            paddingVertical: 5,
            borderRadius: 999,
            backgroundColor: "rgba(255,255,255,0.06)",
            borderWidth: 1,
            borderColor: "rgba(255,255,255,0.08)",
          }}
        >
          <View
            style={{
              width: 6,
              height: 6,
              borderRadius: 3,
              backgroundColor: tone.accent,
              shadowColor: tone.accent,
              shadowOpacity: 0.9,
              shadowRadius: 4,
            }}
          />
          <Text
            style={{
              fontSize: 10,
              letterSpacing: 1.6,
              color: tone.accent,
              textTransform: "uppercase",
              fontWeight: "700",
            }}
          >
            Top theme
          </Text>
        </View>

        {/* Top-right: share percentage */}
        <View
          style={{
            position: "absolute",
            top: 18,
            right: 20,
            alignItems: "flex-end",
          }}
        >
          <Text
            style={{
              fontSize: 16,
              fontWeight: "700",
              color: tone.numberFg,
              letterSpacing: -0.4,
              lineHeight: 18,
            }}
          >
            {(share * 100).toFixed(0)}%
          </Text>
          <Text
            style={{
              fontSize: 9,
              letterSpacing: 1.4,
              color: "rgba(255,255,255,0.5)",
              textTransform: "uppercase",
              fontWeight: "700",
              marginTop: 2,
            }}
          >
            Of all
          </Text>
        </View>

        {/* Ring with centered number */}
        <View
          style={{
            flex: 1,
            alignItems: "center",
            justifyContent: "center",
            paddingTop: 16,
          }}
        >
          <View
            style={{
              width: ringSize,
              height: ringSize,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Ring
              size={ringSize}
              stroke={ringStroke}
              share={share}
              tone={theme.tone}
              gradientId="hero-ring-grad"
              minShare={0.12}
            />
            <View
              style={{
                position: "absolute",
                alignItems: "center",
                paddingHorizontal: 18,
              }}
            >
              <Text
                style={{
                  fontSize: 54,
                  fontWeight: "700",
                  letterSpacing: -2,
                  color: "#FFFFFF",
                  lineHeight: 56,
                }}
              >
                {theme.mentionCount}
              </Text>
              <Text
                style={{
                  fontSize: 10,
                  letterSpacing: 1.6,
                  color: tone.accent,
                  textTransform: "uppercase",
                  fontWeight: "700",
                  marginTop: 6,
                }}
              >
                {theme.mentionCount === 1 ? "Mention" : "Mentions"}
              </Text>
            </View>
          </View>
        </View>

        {/* Bottom: theme name */}
        <View
          style={{
            paddingHorizontal: 24,
            paddingBottom: 22,
            alignItems: "center",
          }}
        >
          <Text
            numberOfLines={1}
            style={{
              fontSize: 24,
              fontWeight: "700",
              color: "#FFFFFF",
              letterSpacing: -0.5,
              textAlign: "center",
            }}
          >
            {sentenceCase(theme.name)}
          </Text>
        </View>
      </Pressable>
    </Animated.View>
  );
}

function SatelliteRing({
  theme,
  rank,
  topCount,
  width,
  index,
  onPress,
  replayToken,
  reduceMotion,
}: {
  theme: RadialTheme;
  rank: number;
  topCount: number;
  width: number;
  index: number;
  onPress: () => void;
  replayToken: number | string;
  reduceMotion: boolean;
}) {
  const animStyle = useEntryAnim(index, replayToken, reduceMotion);
  const tone = TONE[theme.tone];
  const share = topCount > 0 ? theme.mentionCount / topCount : 0;
  const ringSize = 80;
  const ringStroke = 7;
  const rankStr = String(rank).padStart(2, "0");

  return (
    <Animated.View style={[{ width }, animStyle]}>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`${theme.name}, ${theme.mentionCount} mentions, rank ${rank}`}
        style={{
          height: 142,
          borderRadius: 22,
          overflow: "hidden",
          borderWidth: 1,
          borderColor: "rgba(255,255,255,0.06)",
          padding: 14,
        }}
      >
        <Svg
          width="100%"
          height="100%"
          style={{ position: "absolute", inset: 0 }}
          pointerEvents="none"
        >
          <Defs>
            <RadialGradient
              id={`sat-bg-${theme.id}`}
              cx="85%"
              cy="12%"
              r="100%"
            >
              <Stop offset="0%" stopColor={tone.glow} stopOpacity={0.32} />
              <Stop
                offset="55%"
                stopColor={tone.bgStart}
                stopOpacity={0.9}
              />
              <Stop offset="100%" stopColor={tone.bgEnd} stopOpacity={1} />
            </RadialGradient>
          </Defs>
          <Rect
            x="0"
            y="0"
            width="100%"
            height="100%"
            fill={`url(#sat-bg-${theme.id})`}
          />
        </Svg>

        {/* Rank pill */}
        <View
          style={{
            position: "absolute",
            top: 10,
            right: 12,
            paddingHorizontal: 7,
            paddingVertical: 2,
            borderRadius: 6,
            backgroundColor: "rgba(255,255,255,0.08)",
          }}
        >
          <Text
            style={{
              fontSize: 9,
              letterSpacing: 1.2,
              color: tone.accent,
              fontWeight: "700",
            }}
          >
            {rankStr}
          </Text>
        </View>

        {/* Ring with count inside */}
        <View
          style={{
            alignItems: "flex-start",
            marginTop: 6,
          }}
        >
          <View
            style={{
              width: ringSize,
              height: ringSize,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Ring
              size={ringSize}
              stroke={ringStroke}
              share={share}
              tone={theme.tone}
              gradientId={`sat-ring-${theme.id}`}
              minShare={0.1}
              showGlow={false}
            />
            <View
              style={{
                position: "absolute",
                alignItems: "center",
              }}
            >
              <Text
                style={{
                  fontSize: 22,
                  fontWeight: "700",
                  color: "#FFFFFF",
                  letterSpacing: -0.8,
                  lineHeight: 24,
                }}
              >
                {theme.mentionCount}
              </Text>
            </View>
          </View>
        </View>

        {/* Theme name bottom */}
        <View
          style={{
            position: "absolute",
            left: 14,
            right: 14,
            bottom: 12,
          }}
        >
          <Text
            numberOfLines={2}
            style={{
              fontSize: 13,
              fontWeight: "700",
              color: "#FAFAFA",
              letterSpacing: -0.2,
              lineHeight: 16,
            }}
          >
            {sentenceCase(theme.name)}
          </Text>
        </View>
      </Pressable>
    </Animated.View>
  );
}

function ArcRow({
  theme,
  topCount,
  index,
  onPress,
  replayToken,
  reduceMotion,
}: {
  theme: RadialTheme;
  topCount: number;
  index: number;
  onPress: () => void;
  replayToken: number | string;
  reduceMotion: boolean;
}) {
  const animStyle = useEntryAnim(index, replayToken, reduceMotion);
  const tone = TONE[theme.tone];
  const share = topCount > 0 ? theme.mentionCount / topCount : 0;
  const ringSize = 36;
  const ringStroke = 4;

  return (
    <Animated.View style={animStyle}>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`${theme.name}, ${theme.mentionCount} mentions`}
        style={{
          flexDirection: "row",
          alignItems: "center",
          paddingVertical: 12,
          paddingHorizontal: 14,
          marginBottom: 8,
          borderRadius: 16,
          backgroundColor: "rgba(24,24,42,0.6)",
          borderWidth: 1,
          borderColor: "rgba(255,255,255,0.05)",
          gap: 14,
        }}
      >
        <View
          style={{
            width: ringSize,
            height: ringSize,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Ring
            size={ringSize}
            stroke={ringStroke}
            share={share}
            tone={theme.tone}
            gradientId={`row-ring-${theme.id}`}
            minShare={0.1}
            showGlow={false}
          />
          <View
            style={{
              position: "absolute",
              width: 6,
              height: 6,
              borderRadius: 3,
              backgroundColor: tone.accent,
            }}
          />
        </View>

        <Text
          numberOfLines={1}
          style={{
            flex: 1,
            fontSize: 15,
            fontWeight: "600",
            color: "#FAFAFA",
            letterSpacing: -0.1,
          }}
        >
          {sentenceCase(theme.name)}
        </Text>

        <Text
          style={{
            fontSize: 16,
            fontWeight: "700",
            color: tone.accent,
            letterSpacing: -0.2,
          }}
        >
          {theme.mentionCount}
        </Text>
      </Pressable>
    </Animated.View>
  );
}
