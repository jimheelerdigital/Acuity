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
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
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
 * Theme Constellation — Round 4 visualization.
 *
 * Concept: the hero theme is a soft glowing orb at the center. Satellite
 * themes (ranks 2-15) sit on three ghosted orbital rings — inner (2-5),
 * middle (6-10), outer (11-15). Orbit radii scale to the container,
 * and each ring's slot angles are evenly spaced so nothing bunches or
 * clips. Each orb breathes with a 3-5% scale pulse at a ~3-4s period,
 * phase-offset so the whole constellation feels alive but never
 * synchronized or jittery.
 *
 * Above the constellation, an interpretive sentence narrates what the
 * data means — "This month, X came up 28 times, twice as often as
 * anything else." This is the layer no prior round had.
 *
 * Design decisions reconciling prior failures:
 *   - Orbits (Round 1): concept was right; clipped edges + bunched
 *     labels were the execution problems. Fixed here via generous
 *     padding (80% of screen width as the outer orbit diameter) and
 *     polar-position-aware label placement (above for top half, below
 *     for bottom half; outer-ring themes skip the label entirely —
 *     their names appear in the strip list below).
 *   - Bubbles (Round 2): overlapping + saturated. Fixed by fixed
 *     angular slots (no force simulation that can converge incorrectly)
 *     and deep jewel-tone gradients.
 *   - Gallery (Round 3a): rectangles read as boring. Fixed by using
 *     circular geometry + radial gradients + soft glow.
 *   - Rings (Round 3b): "just a gauge report." Fixed by abandoning
 *     the progress-arc metaphor — themes are orbs, not gauges.
 *
 * Rank bands on the constellation:
 *   - Hero (rank 1): 140pt orb at center, name on up to 2 lines BELOW.
 *   - Inner orbit (ranks 2-5): 4 orbs at 72pt, angles 0°/90°/180°/270°
 *     (top/right/bottom/left of hero).
 *   - Middle orbit (ranks 6-10): up to 5 orbs at 52pt, evenly spaced.
 *   - Outer orbit (ranks 11-15): up to 5 orbs at 36pt, evenly spaced,
 *     label-less.
 *   - Rank 16+: strip list below the constellation.
 */

type SentimentTone = "positive" | "challenging" | "neutral";

export type ConstellationTheme = {
  id: string;
  name: string;
  mentionCount: number;
  tone: SentimentTone;
};

type ToneSpec = {
  orbStart: string;
  orbEnd: string;
  glow: string;
  accent: string;
  labelFg: string;
  stripBg: string;
};

const TONE: Record<SentimentTone, ToneSpec> = {
  positive: {
    orbStart: "#34D399",
    orbEnd: "#064E3B",
    glow: "#34D399",
    accent: "#6EE7B7",
    labelFg: "#D1FAE5",
    stripBg: "rgba(6,78,59,0.28)",
  },
  neutral: {
    orbStart: "#818CF8",
    orbEnd: "#1E1B4B",
    glow: "#818CF8",
    accent: "#A5B4FC",
    labelFg: "#DBEAFE",
    stripBg: "rgba(30,27,75,0.42)",
  },
  challenging: {
    orbStart: "#FB7185",
    orbEnd: "#881337",
    glow: "#FB7185",
    accent: "#FDA4AF",
    labelFg: "#FECDD3",
    stripBg: "rgba(136,19,55,0.28)",
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

/**
 * One-sentence narrative that frames the top theme before the user
 * decodes the picture. Falls back gracefully for edge cases:
 *   - 0 themes: returns null (caller hides the line)
 *   - 1 theme: names it with its count only
 *   - hero 2x+ second-place: calls out the gap as "Nx more"
 *   - otherwise: neutral "came up N times"
 */
function buildNarrative(
  themes: ConstellationTheme[],
  timeWindow: string
): string | null {
  const hero = themes[0];
  if (!hero) return null;
  const second = themes[1];
  const timeStr =
    timeWindow === "week"
      ? "this week"
      : timeWindow === "month"
        ? "this month"
        : timeWindow === "3months"
          ? "over the last 3 months"
          : timeWindow === "6months"
            ? "over the last 6 months"
            : "across your history";
  const name = sentenceCase(hero.name);
  const count = hero.mentionCount;
  const countText = `${count} time${count === 1 ? "" : "s"}`;

  if (!second) {
    return `${name} came up ${countText} ${timeStr}.`;
  }

  const ratio = second.mentionCount > 0 ? count / second.mentionCount : 99;
  if (ratio >= 3) {
    return `${name} came up ${countText} ${timeStr} — more than 3× anything else.`;
  }
  if (ratio >= 2) {
    return `${name} came up ${countText} ${timeStr} — twice as often as anything else.`;
  }
  if (ratio >= 1.5) {
    return `${name} led the week at ${countText} — about 1.5× the next theme.`;
  }
  return `${name} came up ${countText} ${timeStr}.`;
}

type OrbitSlot = {
  theme: ConstellationTheme;
  /** x offset from container center, px */
  x: number;
  /** y offset from container center, px */
  y: number;
  size: number;
  /** 0 = top, π/2 = right, π = bottom, 3π/2 = left. Controls label side. */
  angle: number;
  /** Band label for debug + accessibility. "inner" / "middle" / "outer". */
  band: "hero" | "inner" | "middle" | "outer";
  labelPosition: "above" | "below" | "hidden";
};

/**
 * Deterministically place satellites on orbital rings. Angular slots
 * are evenly spaced around each ring so orbs never bunch. Inner ring
 * angles start at top (12 o'clock); each subsequent ring rotates its
 * starting angle by a fraction of its slot-width so orbs on different
 * rings don't visually line up radially.
 */
function buildOrbitLayout(
  themes: ConstellationTheme[],
  width: number,
  height: number
): OrbitSlot[] {
  const cx = 0;
  const cy = 0;
  const radiusUnit = Math.min(width, height) / 2;

  const innerR = radiusUnit * 0.42;
  const middleR = radiusUnit * 0.68;
  const outerR = radiusUnit * 0.94;

  const slots: OrbitSlot[] = [];

  const hero = themes[0];
  if (hero) {
    slots.push({
      theme: hero,
      x: cx,
      y: cy,
      size: 140,
      angle: 0,
      band: "hero",
      labelPosition: "below",
    });
  }

  const inner = themes.slice(1, 5);
  const innerCount = inner.length;
  inner.forEach((t, i) => {
    // Start at 12 o'clock, clockwise.
    const angle = (i * (2 * Math.PI)) / Math.max(innerCount, 1);
    const xOff = Math.sin(angle) * innerR;
    const yOff = -Math.cos(angle) * innerR;
    slots.push({
      theme: t,
      x: cx + xOff,
      y: cy + yOff,
      size: 72,
      angle,
      band: "inner",
      labelPosition: yOff <= 0 ? "above" : "below",
    });
  });

  const middle = themes.slice(5, 10);
  const middleCount = middle.length;
  // Rotate middle ring by half its slot-width so orbs don't align
  // radially with inner-ring orbs.
  const middleOffset =
    middleCount > 0 ? Math.PI / middleCount : 0;
  middle.forEach((t, i) => {
    const angle = (i * (2 * Math.PI)) / Math.max(middleCount, 1) + middleOffset;
    const xOff = Math.sin(angle) * middleR;
    const yOff = -Math.cos(angle) * middleR;
    slots.push({
      theme: t,
      x: cx + xOff,
      y: cy + yOff,
      size: 52,
      angle,
      band: "middle",
      labelPosition: yOff <= 0 ? "above" : "below",
    });
  });

  const outer = themes.slice(10, 15);
  const outerCount = outer.length;
  // Rotate outer ring by a quarter slot so it's offset from both.
  const outerOffset =
    outerCount > 0 ? Math.PI / (outerCount * 2) : 0;
  outer.forEach((t, i) => {
    const angle = (i * (2 * Math.PI)) / Math.max(outerCount, 1) + outerOffset;
    const xOff = Math.sin(angle) * outerR;
    const yOff = -Math.cos(angle) * outerR;
    slots.push({
      theme: t,
      x: cx + xOff,
      y: cy + yOff,
      size: 36,
      angle,
      band: "outer",
      labelPosition: "hidden",
    });
  });

  return slots;
}

export function ThemeConstellation({
  themes,
  onTap,
  replayToken = 0,
  timeWindow = "month",
}: {
  themes: ConstellationTheme[];
  onTap?: (id: string) => void;
  replayToken?: number | string;
  /** Accepts any TimeWindow string; narrative adapts "this week/month/period". */
  timeWindow?: string;
}) {
  const { width: screenWidth } = useWindowDimensions();
  const reduceMotion = useReduceMotion();

  const gutter = 20;
  // Constellation container is a square centered below the narrative.
  // Width is the screen width minus gutters, capped so on iPad-ish
  // widths it doesn't balloon.
  const containerSize = Math.min(screenWidth - gutter * 2, 380);

  const narrative = useMemo(
    () => buildNarrative(themes, timeWindow),
    [themes, timeWindow]
  );

  const constellationThemes = useMemo(() => themes.slice(0, 15), [themes]);
  const stripThemes = useMemo(() => themes.slice(15), [themes]);

  const slots = useMemo(
    () => buildOrbitLayout(constellationThemes, containerSize, containerSize),
    [constellationThemes, containerSize]
  );

  const heroTone =
    slots.find((s) => s.band === "hero")?.theme.tone ?? "neutral";

  if (themes.length === 0) return null;

  const handleTap = (id: string) => {
    tapHaptic();
    onTap?.(id);
  };

  return (
    <View style={{ paddingHorizontal: gutter }}>
      {narrative && (
        <View
          style={{
            paddingVertical: 14,
            paddingHorizontal: 4,
            marginBottom: 6,
          }}
        >
          <Text
            style={{
              fontSize: 10,
              letterSpacing: 1.8,
              color: "rgba(228,228,231,0.5)",
              textTransform: "uppercase",
              fontWeight: "700",
              marginBottom: 6,
            }}
          >
            What stood out
          </Text>
          <Text
            style={{
              fontSize: 18,
              lineHeight: 26,
              fontWeight: "500",
              color: "rgba(250,250,250,0.92)",
              letterSpacing: -0.2,
            }}
          >
            {narrative}
          </Text>
        </View>
      )}

      {/* Constellation stage */}
      <View
        style={{
          width: containerSize,
          height: containerSize,
          alignSelf: "center",
          marginVertical: 12,
        }}
      >
        <ConstellationBackdrop tone={heroTone} size={containerSize} />
        <OrbitGuides size={containerSize} />
        {slots.map((slot, i) => (
          <OrbSatellite
            key={slot.theme.id}
            slot={slot}
            index={i}
            containerSize={containerSize}
            replayToken={replayToken}
            reduceMotion={reduceMotion}
            onPress={() => handleTap(slot.theme.id)}
          />
        ))}
      </View>

      {/* Hero name (below constellation, centered) */}
      {slots[0] && (
        <View style={{ alignItems: "center", marginTop: 4, marginBottom: 6 }}>
          <Text
            style={{
              fontSize: 10,
              letterSpacing: 1.8,
              color: TONE[slots[0].theme.tone].accent,
              textTransform: "uppercase",
              fontWeight: "700",
              marginBottom: 6,
            }}
          >
            Top theme · {slots[0].theme.mentionCount} mentions
          </Text>
          <Text
            numberOfLines={2}
            style={{
              fontSize: 26,
              fontWeight: "700",
              color: "#FFFFFF",
              letterSpacing: -0.5,
              textAlign: "center",
              lineHeight: 30,
              paddingHorizontal: 20,
            }}
          >
            {sentenceCase(slots[0].theme.name)}
          </Text>
        </View>
      )}

      {stripThemes.length > 0 && (
        <View style={{ marginTop: 22 }}>
          <Text
            style={{
              fontSize: 10,
              letterSpacing: 1.8,
              color: "rgba(228,228,231,0.5)",
              textTransform: "uppercase",
              fontWeight: "700",
              marginBottom: 10,
              marginLeft: 4,
            }}
          >
            The rest · {stripThemes.length}
          </Text>
          {stripThemes.map((t, i) => (
            <StripRow
              key={t.id}
              theme={t}
              index={i}
              replayToken={replayToken}
              reduceMotion={reduceMotion}
              onPress={() => handleTap(t.id)}
            />
          ))}
        </View>
      )}
    </View>
  );
}

function ConstellationBackdrop({
  tone,
  size,
}: {
  tone: SentimentTone;
  size: number;
}) {
  const t = TONE[tone];
  return (
    <View
      style={{
        position: "absolute",
        inset: 0,
        borderRadius: size / 2,
        overflow: "hidden",
      }}
      pointerEvents="none"
    >
      <Svg width="100%" height="100%">
        <Defs>
          <RadialGradient id="constellation-bg" cx="50%" cy="50%" r="70%">
            <Stop offset="0%" stopColor={t.glow} stopOpacity={0.18} />
            <Stop offset="55%" stopColor="#0F0D1F" stopOpacity={0.5} />
            <Stop offset="100%" stopColor="#0B0B12" stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect
          x="0"
          y="0"
          width="100%"
          height="100%"
          fill="url(#constellation-bg)"
        />
      </Svg>
    </View>
  );
}

function OrbitGuides({ size }: { size: number }) {
  const cx = size / 2;
  const cy = size / 2;
  const radiusUnit = size / 2;
  const innerR = radiusUnit * 0.42;
  const middleR = radiusUnit * 0.68;
  const outerR = radiusUnit * 0.94;
  return (
    <Svg
      width={size}
      height={size}
      style={{ position: "absolute", inset: 0 }}
      pointerEvents="none"
    >
      <Circle
        cx={cx}
        cy={cy}
        r={innerR}
        stroke="rgba(255,255,255,0.05)"
        strokeWidth={1}
        strokeDasharray="2 5"
        fill="none"
      />
      <Circle
        cx={cx}
        cy={cy}
        r={middleR}
        stroke="rgba(255,255,255,0.04)"
        strokeWidth={1}
        strokeDasharray="2 5"
        fill="none"
      />
      <Circle
        cx={cx}
        cy={cy}
        r={outerR}
        stroke="rgba(255,255,255,0.03)"
        strokeWidth={1}
        strokeDasharray="2 5"
        fill="none"
      />
    </Svg>
  );
}

function OrbSatellite({
  slot,
  index,
  containerSize,
  replayToken,
  reduceMotion,
  onPress,
}: {
  slot: OrbitSlot;
  index: number;
  containerSize: number;
  replayToken: number | string;
  reduceMotion: boolean;
  onPress: () => void;
}) {
  const opacity = useSharedValue(reduceMotion ? 1 : 0);
  const translateY = useSharedValue(reduceMotion ? 0 : 10);
  // Breathing scale. Each orb's phase is offset by a prime-ish
  // increment so the constellation never pulses in unison.
  const breath = useSharedValue(1);

  useEffect(() => {
    if (reduceMotion) {
      opacity.value = 1;
      translateY.value = 0;
      breath.value = 1;
      return;
    }
    opacity.value = 0;
    translateY.value = 10;
    const entryDelay = Math.min(index * 55, 600);
    opacity.value = withDelay(
      entryDelay,
      withTiming(1, { duration: 420, easing: Easing.out(Easing.cubic) })
    );
    translateY.value = withDelay(
      entryDelay,
      withTiming(0, { duration: 420, easing: Easing.out(Easing.cubic) })
    );
    // Start breathing once the entry animation is nearly done.
    const breathPeriod = 3600 + (index % 5) * 280;
    const breathStart = entryDelay + 400;
    breath.value = withDelay(
      breathStart,
      withRepeat(
        withSequence(
          withTiming(1.035, {
            duration: breathPeriod / 2,
            easing: Easing.inOut(Easing.sin),
          }),
          withTiming(0.97, {
            duration: breathPeriod / 2,
            easing: Easing.inOut(Easing.sin),
          })
        ),
        -1,
        true
      )
    );
    return () => {
      cancelAnimation(breath);
    };
  }, [index, replayToken, reduceMotion, opacity, translateY, breath]);

  const animStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }, { scale: breath.value }],
  }));

  const tone = TONE[slot.theme.tone];
  const centerX = containerSize / 2;
  const centerY = containerSize / 2;
  const orbX = centerX + slot.x - slot.size / 2;
  const orbY = centerY + slot.y - slot.size / 2;

  const gradientId = `orb-${slot.theme.id}`;
  const glowInset = slot.size * 0.25;

  return (
    <>
      <Animated.View
        style={[
          {
            position: "absolute",
            left: orbX,
            top: orbY,
            width: slot.size,
            height: slot.size,
          },
          animStyle,
        ]}
      >
        <Pressable
          onPress={onPress}
          accessibilityRole="button"
          accessibilityLabel={`${slot.theme.name}, ${slot.theme.mentionCount} mentions`}
          style={{
            flex: 1,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Svg
            width={slot.size + glowInset * 2}
            height={slot.size + glowInset * 2}
            style={{
              position: "absolute",
              left: -glowInset,
              top: -glowInset,
            }}
          >
            <Defs>
              <RadialGradient id={`${gradientId}-glow`} cx="50%" cy="50%" r="50%">
                <Stop offset="0%" stopColor={tone.glow} stopOpacity={0.55} />
                <Stop offset="70%" stopColor={tone.glow} stopOpacity={0.08} />
                <Stop offset="100%" stopColor={tone.glow} stopOpacity={0} />
              </RadialGradient>
              <RadialGradient
                id={`${gradientId}-fill`}
                cx="35%"
                cy="28%"
                r="75%"
              >
                <Stop offset="0%" stopColor={tone.orbStart} stopOpacity={1} />
                <Stop offset="55%" stopColor={tone.orbStart} stopOpacity={0.92} />
                <Stop offset="100%" stopColor={tone.orbEnd} stopOpacity={1} />
              </RadialGradient>
              <SvgLinearGradient
                id={`${gradientId}-rim`}
                x1="0"
                y1="0"
                x2="0"
                y2="1"
              >
                <Stop offset="0%" stopColor="rgba(255,255,255,0.35)" />
                <Stop offset="100%" stopColor="rgba(255,255,255,0)" />
              </SvgLinearGradient>
            </Defs>
            {/* Outer glow */}
            <Circle
              cx={(slot.size + glowInset * 2) / 2}
              cy={(slot.size + glowInset * 2) / 2}
              r={slot.size / 2 + glowInset * 0.7}
              fill={`url(#${gradientId}-glow)`}
            />
            {/* Orb body */}
            <Circle
              cx={(slot.size + glowInset * 2) / 2}
              cy={(slot.size + glowInset * 2) / 2}
              r={slot.size / 2}
              fill={`url(#${gradientId}-fill)`}
            />
            {/* Rim highlight */}
            <Circle
              cx={(slot.size + glowInset * 2) / 2}
              cy={(slot.size + glowInset * 2) / 2}
              r={slot.size / 2 - 0.5}
              stroke={`url(#${gradientId}-rim)`}
              strokeWidth={1}
              fill="none"
            />
          </Svg>

          {slot.band === "hero" && (
            <View style={{ alignItems: "center" }}>
              <Text
                style={{
                  fontSize: 40,
                  fontWeight: "700",
                  color: "#FFFFFF",
                  letterSpacing: -1.4,
                  lineHeight: 44,
                }}
              >
                {slot.theme.mentionCount}
              </Text>
            </View>
          )}

          {slot.band === "inner" && (
            <Text
              style={{
                fontSize: 18,
                fontWeight: "700",
                color: "#FFFFFF",
                letterSpacing: -0.5,
              }}
            >
              {slot.theme.mentionCount}
            </Text>
          )}

          {slot.band === "middle" && (
            <Text
              style={{
                fontSize: 14,
                fontWeight: "700",
                color: "#FFFFFF",
                letterSpacing: -0.3,
              }}
            >
              {slot.theme.mentionCount}
            </Text>
          )}

          {slot.band === "outer" && (
            <Text
              style={{
                fontSize: 11,
                fontWeight: "700",
                color: "#FFFFFF",
                letterSpacing: -0.2,
              }}
            >
              {slot.theme.mentionCount}
            </Text>
          )}
        </Pressable>
      </Animated.View>

      {slot.labelPosition !== "hidden" && slot.band !== "hero" && (
        <OrbitLabel
          name={slot.theme.name}
          side={slot.labelPosition}
          centerX={centerX + slot.x}
          centerY={centerY + slot.y}
          orbSize={slot.size}
          index={index}
          replayToken={replayToken}
          reduceMotion={reduceMotion}
        />
      )}
    </>
  );
}

function OrbitLabel({
  name,
  side,
  centerX,
  centerY,
  orbSize,
  index,
  replayToken,
  reduceMotion,
}: {
  name: string;
  side: "above" | "below";
  centerX: number;
  centerY: number;
  orbSize: number;
  index: number;
  replayToken: number | string;
  reduceMotion: boolean;
}) {
  const opacity = useSharedValue(reduceMotion ? 1 : 0);
  useEffect(() => {
    if (reduceMotion) {
      opacity.value = 1;
      return;
    }
    opacity.value = 0;
    const delay = Math.min(index * 55, 600) + 300;
    opacity.value = withDelay(
      delay,
      withTiming(1, { duration: 400, easing: Easing.out(Easing.cubic) })
    );
  }, [index, replayToken, reduceMotion, opacity]);

  const animStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  const labelWidth = 90;
  const labelHeight = 28;
  const gap = 6;
  const yOffset =
    side === "above" ? -orbSize / 2 - gap - labelHeight : orbSize / 2 + gap;

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: "absolute",
          left: centerX - labelWidth / 2,
          top: centerY + yOffset,
          width: labelWidth,
          height: labelHeight,
          alignItems: "center",
          justifyContent: "center",
        },
        animStyle,
      ]}
    >
      <Text
        numberOfLines={1}
        style={{
          fontSize: 11,
          fontWeight: "600",
          color: "rgba(228,228,231,0.86)",
          letterSpacing: -0.1,
          textAlign: "center",
        }}
      >
        {sentenceCase(name)}
      </Text>
    </Animated.View>
  );
}

function StripRow({
  theme,
  index,
  replayToken,
  reduceMotion,
  onPress,
}: {
  theme: ConstellationTheme;
  index: number;
  replayToken: number | string;
  reduceMotion: boolean;
  onPress: () => void;
}) {
  const opacity = useSharedValue(reduceMotion ? 1 : 0);
  const translateY = useSharedValue(reduceMotion ? 0 : 8);
  useEffect(() => {
    if (reduceMotion) {
      opacity.value = 1;
      translateY.value = 0;
      return;
    }
    opacity.value = 0;
    translateY.value = 8;
    const delay = Math.min(index * 30, 400);
    opacity.value = withDelay(
      delay,
      withTiming(1, { duration: 320, easing: Easing.out(Easing.cubic) })
    );
    translateY.value = withDelay(
      delay,
      withTiming(0, { duration: 320, easing: Easing.out(Easing.cubic) })
    );
  }, [index, replayToken, reduceMotion, opacity, translateY]);

  const animStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  const tone = TONE[theme.tone];

  return (
    <Animated.View style={animStyle}>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`${theme.name}, ${theme.mentionCount} mentions`}
        style={{
          flexDirection: "row",
          alignItems: "center",
          paddingVertical: 13,
          paddingHorizontal: 16,
          marginBottom: 6,
          borderRadius: 14,
          backgroundColor: tone.stripBg,
          borderWidth: 1,
          borderColor: "rgba(255,255,255,0.04)",
          overflow: "hidden",
        }}
      >
        <View
          style={{
            position: "absolute",
            left: 0,
            top: 10,
            bottom: 10,
            width: 3,
            borderRadius: 2,
            backgroundColor: tone.glow,
            shadowColor: tone.glow,
            shadowOpacity: 0.6,
            shadowRadius: 4,
          }}
        />
        <Text
          numberOfLines={1}
          style={{
            flex: 1,
            marginLeft: 10,
            fontSize: 14,
            fontWeight: "600",
            color: "#FAFAFA",
            letterSpacing: -0.1,
          }}
        >
          {sentenceCase(theme.name)}
        </Text>
        <Text
          style={{
            fontSize: 14,
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
