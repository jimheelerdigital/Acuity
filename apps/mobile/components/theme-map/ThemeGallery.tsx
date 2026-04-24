import * as Haptics from "expo-haptics";
import { useEffect, useMemo } from "react";
import {
  AccessibilityInfo,
  Platform,
  Pressable,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { useState } from "react";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from "react-native-reanimated";
import Svg, {
  Defs,
  RadialGradient,
  Rect,
  Stop,
} from "react-native-svg";

/**
 * Theme Gallery — editorial-hierarchy visualization of recurring
 * themes. Scales from 1 → 30+ themes by giving each rank a distinct
 * visual treatment rather than packing everything into one geometry:
 *
 *   Rank 1     → Hero card (full-width, 170pt, big radial glow + 34pt name)
 *   Ranks 2–3  → Row of 2 medium cards (side-by-side, 130pt tall)
 *   Ranks 4–7  → 2×2 grid of small cards (~90pt tall)
 *   Ranks 8+   → Premium list rows (64pt, gradient stripe + typography)
 *
 * Sentiment determines gradient hue:
 *   positive    → emerald (#064E3B → #34D399)
 *   neutral     → indigo   (#1E1B4B → #818CF8)
 *   challenging → rose     (#881337 → #FB7185)
 *
 * Entry: staggered fade+slide (translateY 16 → 0), 360ms per item,
 * 45ms stagger, ease-out cubic. ReduceMotion bypasses entirely.
 *
 * Rejected alternatives:
 *   - Orbiting constellation: motion felt too aggressive, labels
 *     overlapped at high theme counts
 *   - Bubble cluster w/ d3-force: overlapping labels, saturated
 *     mint/crimson/violet read as "preschool toy"
 *   - Bar chart: scales, but reads as Excel
 */

type SentimentTone = "positive" | "challenging" | "neutral";

export type GalleryTheme = {
  id: string;
  name: string;
  mentionCount: number;
  tone: SentimentTone;
};

type ToneGradient = {
  bgStart: string;
  bgEnd: string;
  glow: string;
  accent: string;
  numberFg: string;
};

const GRADIENT: Record<SentimentTone, ToneGradient> = {
  positive: {
    bgStart: "#064E3B",
    bgEnd: "#022C22",
    glow: "#34D399",
    accent: "#6EE7B7",
    numberFg: "#D1FAE5",
  },
  neutral: {
    bgStart: "#1E1B4B",
    bgEnd: "#0F0D2E",
    glow: "#818CF8",
    accent: "#A5B4FC",
    numberFg: "#DBEAFE",
  },
  challenging: {
    bgStart: "#881337",
    bgEnd: "#500724",
    glow: "#FB7185",
    accent: "#FDA4AF",
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

export function ThemeGallery({
  themes,
  onTap,
  replayToken = 0,
}: {
  themes: GalleryTheme[];
  onTap?: (id: string) => void;
  replayToken?: number | string;
}) {
  const { width: screenWidth } = useWindowDimensions();
  const reduceMotion = useReduceMotion();

  const { hero, midRow, gridCards, rest } = useMemo(() => {
    const hero = themes[0] ?? null;
    const midRow = themes.slice(1, 3);
    const gridCards = themes.slice(3, 7);
    const rest = themes.slice(7);
    return { hero, midRow, gridCards, rest };
  }, [themes]);

  if (!hero) {
    return null;
  }

  const handleTap = (id: string) => {
    tapHaptic();
    onTap?.(id);
  };

  // Precompute sizes based on screen width so the cards breathe at
  // any device size (SE → Pro Max) without per-breakpoint branches.
  const gutter = 20;
  const contentWidth = screenWidth - gutter * 2;
  const midCardWidth = (contentWidth - 10) / 2;
  const gridCardWidth = (contentWidth - 10) / 2;

  return (
    <View style={{ paddingHorizontal: gutter }}>
      <HeroCard
        theme={hero}
        index={0}
        onPress={() => handleTap(hero.id)}
        replayToken={replayToken}
        reduceMotion={reduceMotion}
      />

      {midRow.length > 0 && (
        <View
          style={{
            flexDirection: "row",
            gap: 10,
            marginTop: 10,
          }}
        >
          {midRow.map((t, i) => (
            <MidCard
              key={t.id}
              theme={t}
              width={midCardWidth}
              index={i + 1}
              onPress={() => handleTap(t.id)}
              replayToken={replayToken}
              reduceMotion={reduceMotion}
            />
          ))}
        </View>
      )}

      {gridCards.length > 0 && (
        <View
          style={{
            marginTop: 10,
            flexDirection: "row",
            flexWrap: "wrap",
            gap: 10,
          }}
        >
          {gridCards.map((t, i) => (
            <SmallCard
              key={t.id}
              theme={t}
              width={gridCardWidth}
              index={i + 3}
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
            <StripRow
              key={t.id}
              theme={t}
              index={i + 7}
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

function useEntryAnim(index: number, replayToken: number | string, reduceMotion: boolean) {
  const opacity = useSharedValue(reduceMotion ? 1 : 0);
  const translateY = useSharedValue(reduceMotion ? 0 : 16);

  useEffect(() => {
    if (reduceMotion) {
      opacity.value = 1;
      translateY.value = 0;
      return;
    }
    opacity.value = 0;
    translateY.value = 16;
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

  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  return style;
}

function GradientBackground({
  tone,
  intensity = 1,
}: {
  tone: SentimentTone;
  intensity?: number;
}) {
  const g = GRADIENT[tone];
  const gradId = `grad-${tone}`;
  const glowId = `glow-${tone}`;
  return (
    <Svg
      width="100%"
      height="100%"
      style={{ position: "absolute", inset: 0 }}
      pointerEvents="none"
    >
      <Defs>
        <RadialGradient
          id={gradId}
          cx="85%"
          cy="10%"
          r="95%"
        >
          <Stop offset="0%" stopColor={g.glow} stopOpacity={0.35 * intensity} />
          <Stop offset="55%" stopColor={g.bgStart} stopOpacity={0.95} />
          <Stop offset="100%" stopColor={g.bgEnd} stopOpacity={1} />
        </RadialGradient>
        <RadialGradient id={glowId} cx="15%" cy="95%" r="60%">
          <Stop offset="0%" stopColor={g.accent} stopOpacity={0.18 * intensity} />
          <Stop offset="100%" stopColor={g.bgEnd} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${gradId})`} />
      <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${glowId})`} />
    </Svg>
  );
}

function HeroCard({
  theme,
  index,
  onPress,
  replayToken,
  reduceMotion,
}: {
  theme: GalleryTheme;
  index: number;
  onPress: () => void;
  replayToken: number | string;
  reduceMotion: boolean;
}) {
  const animStyle = useEntryAnim(index, replayToken, reduceMotion);
  const g = GRADIENT[theme.tone];

  return (
    <Animated.View style={animStyle}>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`${theme.name}, ${theme.mentionCount} mentions`}
        style={{
          height: 170,
          borderRadius: 24,
          overflow: "hidden",
          borderWidth: 1,
          borderColor: "rgba(255,255,255,0.08)",
          shadowColor: g.glow,
          shadowOffset: { width: 0, height: 8 },
          shadowRadius: 24,
          shadowOpacity: 0.25,
          elevation: 6,
        }}
      >
        <GradientBackground tone={theme.tone} intensity={1.2} />
        <View
          style={{
            flex: 1,
            padding: 22,
            justifyContent: "space-between",
          }}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
            }}
          >
            <View
              style={{
                width: 8,
                height: 8,
                borderRadius: 4,
                backgroundColor: g.accent,
                shadowColor: g.accent,
                shadowOpacity: 0.8,
                shadowRadius: 4,
              }}
            />
            <Text
              style={{
                fontSize: 10,
                fontWeight: "600",
                letterSpacing: 1.6,
                color: g.accent,
                textTransform: "uppercase",
              }}
            >
              Top theme
            </Text>
          </View>

          <View>
            <Text
              numberOfLines={2}
              style={{
                fontSize: 34,
                fontWeight: "700",
                letterSpacing: -0.8,
                lineHeight: 38,
                color: "#FFFFFF",
              }}
            >
              {sentenceCase(theme.name)}
            </Text>
            <View
              style={{
                flexDirection: "row",
                alignItems: "baseline",
                gap: 6,
                marginTop: 8,
              }}
            >
              <Text
                style={{
                  fontSize: 28,
                  fontWeight: "700",
                  letterSpacing: -1,
                  color: g.numberFg,
                }}
              >
                {theme.mentionCount}
              </Text>
              <Text
                style={{
                  fontSize: 12,
                  letterSpacing: 1.2,
                  textTransform: "uppercase",
                  color: "rgba(255,255,255,0.6)",
                  fontWeight: "600",
                }}
              >
                {theme.mentionCount === 1 ? "Mention" : "Mentions"}
              </Text>
            </View>
          </View>
        </View>
      </Pressable>
    </Animated.View>
  );
}

function MidCard({
  theme,
  width,
  index,
  onPress,
  replayToken,
  reduceMotion,
}: {
  theme: GalleryTheme;
  width: number;
  index: number;
  onPress: () => void;
  replayToken: number | string;
  reduceMotion: boolean;
}) {
  const animStyle = useEntryAnim(index, replayToken, reduceMotion);
  const g = GRADIENT[theme.tone];

  return (
    <Animated.View style={[{ width }, animStyle]}>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`${theme.name}, ${theme.mentionCount} mentions`}
        style={{
          height: 130,
          borderRadius: 20,
          overflow: "hidden",
          borderWidth: 1,
          borderColor: "rgba(255,255,255,0.06)",
        }}
      >
        <GradientBackground tone={theme.tone} intensity={0.9} />
        <View
          style={{
            flex: 1,
            padding: 16,
            justifyContent: "space-between",
          }}
        >
          <View
            style={{
              width: 6,
              height: 6,
              borderRadius: 3,
              backgroundColor: g.accent,
            }}
          />
          <View>
            <Text
              numberOfLines={2}
              style={{
                fontSize: 18,
                fontWeight: "700",
                letterSpacing: -0.3,
                lineHeight: 22,
                color: "#FFFFFF",
              }}
            >
              {sentenceCase(theme.name)}
            </Text>
            <Text
              style={{
                fontSize: 11,
                letterSpacing: 0.6,
                marginTop: 4,
                color: "rgba(255,255,255,0.65)",
                fontWeight: "500",
              }}
            >
              {theme.mentionCount} mentions
            </Text>
          </View>
        </View>
      </Pressable>
    </Animated.View>
  );
}

function SmallCard({
  theme,
  width,
  index,
  onPress,
  replayToken,
  reduceMotion,
}: {
  theme: GalleryTheme;
  width: number;
  index: number;
  onPress: () => void;
  replayToken: number | string;
  reduceMotion: boolean;
}) {
  const animStyle = useEntryAnim(index, replayToken, reduceMotion);
  const g = GRADIENT[theme.tone];

  return (
    <Animated.View style={[{ width }, animStyle]}>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`${theme.name}, ${theme.mentionCount} mentions`}
        style={{
          height: 96,
          borderRadius: 18,
          overflow: "hidden",
          borderWidth: 1,
          borderColor: "rgba(255,255,255,0.05)",
        }}
      >
        <GradientBackground tone={theme.tone} intensity={0.7} />
        <View
          style={{
            flex: 1,
            padding: 14,
            justifyContent: "space-between",
          }}
        >
          <View
            style={{
              width: 5,
              height: 5,
              borderRadius: 3,
              backgroundColor: g.accent,
            }}
          />
          <View>
            <Text
              numberOfLines={1}
              style={{
                fontSize: 14,
                fontWeight: "600",
                color: "#FFFFFF",
                letterSpacing: -0.2,
              }}
            >
              {sentenceCase(theme.name)}
            </Text>
            <Text
              style={{
                fontSize: 11,
                marginTop: 2,
                color: "rgba(255,255,255,0.55)",
                fontWeight: "500",
              }}
            >
              {theme.mentionCount} mentions
            </Text>
          </View>
        </View>
      </Pressable>
    </Animated.View>
  );
}

function StripRow({
  theme,
  index,
  onPress,
  replayToken,
  reduceMotion,
}: {
  theme: GalleryTheme;
  index: number;
  onPress: () => void;
  replayToken: number | string;
  reduceMotion: boolean;
}) {
  const animStyle = useEntryAnim(index, replayToken, reduceMotion);
  const g = GRADIENT[theme.tone];

  return (
    <Animated.View style={animStyle}>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`${theme.name}, ${theme.mentionCount} mentions`}
        style={{
          flexDirection: "row",
          alignItems: "center",
          paddingVertical: 14,
          paddingHorizontal: 16,
          marginBottom: 8,
          borderRadius: 14,
          backgroundColor: "rgba(30,27,75,0.35)",
          borderWidth: 1,
          borderColor: "rgba(255,255,255,0.04)",
          overflow: "hidden",
        }}
      >
        <View
          style={{
            position: "absolute",
            left: 0,
            top: 8,
            bottom: 8,
            width: 3,
            borderRadius: 2,
            backgroundColor: g.glow,
          }}
        />
        <Text
          numberOfLines={1}
          style={{
            flex: 1,
            marginLeft: 10,
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
            color: g.accent,
            letterSpacing: -0.2,
          }}
        >
          {theme.mentionCount}
        </Text>
      </Pressable>
    </Animated.View>
  );
}
