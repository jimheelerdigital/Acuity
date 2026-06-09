import type { ComponentType } from "react";
import { useEffect, useRef } from "react";
import { Text, View, type TextProps } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from "react-native-reanimated";

import { RingProgress, Sparkbar } from "@/components/acuity";
import { useTheme } from "@/contexts/theme-context";
import { useCountUp } from "./use-count-up";

// Widen Text's animated-prop surface to include the `text` field that
// reanimated special-cases at runtime but doesn't declare in its
// AnimatedPropsProp<TextProps> mapping. Same workaround pattern we
// use for RingProgress's strokeDashoffset on AnimatedCircle.
type AnimatableTextProps = TextProps & { text?: string };
const AnimatedText = Animated.createAnimatedComponent(
  Text as ComponentType<AnimatableTextProps>
);

/**
 * TodayStatsRow — three side-by-side stat cards.
 *   1. Streak ring (RingProgress with current streak in center)
 *   2. Entries this week (sparkbar with 7-day counts)
 *   3. Minutes recorded (count-up value, no chart)
 *
 * Animations:
 *   - All three numbers run motion #3 count-up (850ms easeOutCubic)
 *     on mount.
 *   - Streak ring runs motion #6 streak fill — when `currentStreak`
 *     increments vs. the prior render, a "+1" floater appears above
 *     the number and the ring bar fills with a 520ms transition.
 *     Only fires on actual increment (not first mount).
 */

interface TodayStatsRowProps {
  currentStreak: number;
  /** Longest streak — used as ring denominator to scale fill 0-100. */
  longestStreak: number;
  /** 7-day counts oldest → newest. Pass empty array when entries are unknown. */
  weekBars: number[];
  /** Minutes recorded total (or "this week" — caller decides scope). */
  minutesRecorded: number;
  /** Label for the third stat. Default "minutes". Pass "themes" if substituting. */
  minutesLabel?: string;
}

// Motion #6 spec values.
const STREAK_FLOATER_DUR_MS = 700;
const STREAK_RING_FILL_DUR_MS = 520;
const EASE_STANDARD = Easing.bezier(0.32, 0.72, 0, 1);

export function TodayStatsRow({
  currentStreak,
  longestStreak,
  weekBars,
  minutesRecorded,
  minutesLabel = "minutes",
}: TodayStatsRowProps) {
  const { tokens } = useTheme();

  // Ring value 0-100. Use longest streak as the denominator so the
  // ring reads as "progress to your best". Falls back to 7 (one week)
  // for new users with no longest yet, so the ring isn't perpetually
  // full.
  const ringMax = Math.max(longestStreak, 7);
  const ringValue = Math.min(100, (currentStreak / ringMax) * 100);

  // Detect streak increment for motion #6. Skip the first mount —
  // we only celebrate actual ticks, not focus revisits.
  const prevStreakRef = useRef<number | null>(null);
  const floaterOpacity = useSharedValue(0);
  const floaterY = useSharedValue(0);

  useEffect(() => {
    const prev = prevStreakRef.current;
    prevStreakRef.current = currentStreak;
    if (prev == null) return;
    if (currentStreak <= prev) return;
    // +1 floater: appears above the number, lifts -16, fades 0→1→0.
    floaterOpacity.value = 0;
    floaterY.value = 0;
    floaterOpacity.value = withSequence(
      withTiming(1, { duration: 200, easing: EASE_STANDARD }),
      withDelay(
        STREAK_FLOATER_DUR_MS - 400,
        withTiming(0, { duration: 200, easing: EASE_STANDARD })
      )
    );
    floaterY.value = withTiming(-16, {
      duration: STREAK_FLOATER_DUR_MS,
      easing: EASE_STANDARD,
    });
  }, [currentStreak, floaterOpacity, floaterY]);

  const floaterStyle = useAnimatedStyle(() => ({
    opacity: floaterOpacity.value,
    transform: [{ translateY: floaterY.value }],
  }));

  const streakCountUp = useCountUp(currentStreak);
  const minutesCountUp = useCountUp(Math.round(minutesRecorded));

  return (
    <View
      style={{
        flexDirection: "row",
        gap: 10,
        alignItems: "stretch",
      }}
    >
      {/* Streak ring tile */}
      <View
        style={{
          flex: 1,
          padding: 14,
          borderRadius: tokens.radius.lg,
          backgroundColor: tokens.cardBg,
          borderWidth: 0.5,
          borderColor: tokens.line,
          alignItems: "center",
          gap: 8,
        }}
      >
        <RingProgress
          value={ringValue}
          size={72}
          strokeWidth={6}
          animated={true}
        >
          <View style={{ alignItems: "center", position: "relative" }}>
            <Animated.View
              pointerEvents="none"
              style={[
                {
                  position: "absolute",
                  top: -22,
                },
                floaterStyle,
              ]}
            >
              <Text
                style={{
                  fontFamily: tokens.fontMono,
                  fontSize: 11,
                  fontWeight: "700",
                  color: tokens.good,
                }}
              >
                +1
              </Text>
            </Animated.View>
            <AnimatedText
              animatedProps={streakCountUp}
              style={{
                fontFamily: tokens.fontDisplay,
                fontSize: 26,
                fontWeight: "800",
                letterSpacing: -0.6,
                lineHeight: 28,
                color: tokens.text,
                fontVariant: ["tabular-nums"],
              }}
            />
          </View>
        </RingProgress>
        <Text
          style={{
            fontFamily: tokens.fontMono,
            fontSize: 10,
            fontWeight: "700",
            letterSpacing: 1.2,
            textTransform: "uppercase",
            color: tokens.textTer,
          }}
        >
          Streak · {currentStreak === 1 ? "day" : "days"}
        </Text>
      </View>

      {/* Entries sparkbar tile */}
      <View
        style={{
          flex: 1,
          padding: 14,
          borderRadius: tokens.radius.lg,
          backgroundColor: tokens.cardBg,
          borderWidth: 0.5,
          borderColor: tokens.line,
          gap: 8,
          justifyContent: "space-between",
        }}
      >
        <View>
          <Text
            style={{
              fontFamily: tokens.fontDisplay,
              fontSize: 26,
              fontWeight: "800",
              letterSpacing: -0.6,
              lineHeight: 28,
              color: tokens.text,
              fontVariant: ["tabular-nums"],
            }}
          >
            {weekBars.reduce((a, b) => a + b, 0)}
          </Text>
          <Text
            style={{
              fontFamily: tokens.fontMono,
              fontSize: 10,
              fontWeight: "700",
              letterSpacing: 1.2,
              textTransform: "uppercase",
              color: tokens.textTer,
              marginTop: 2,
            }}
          >
            Entries · 7d
          </Text>
        </View>
        <Sparkbar values={weekBars.length > 0 ? weekBars : [0, 0, 0, 0, 0, 0, 0]} height={28} />
      </View>

      {/* Minutes tile */}
      <View
        style={{
          flex: 1,
          padding: 14,
          borderRadius: tokens.radius.lg,
          backgroundColor: tokens.cardBg,
          borderWidth: 0.5,
          borderColor: tokens.line,
          gap: 8,
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <AnimatedText
          animatedProps={minutesCountUp}
          style={{
            fontFamily: tokens.fontDisplay,
            fontSize: 26,
            fontWeight: "800",
            letterSpacing: -0.6,
            lineHeight: 28,
            color: tokens.text,
            fontVariant: ["tabular-nums"],
          }}
        />
        <Text
          style={{
            fontFamily: tokens.fontMono,
            fontSize: 10,
            fontWeight: "700",
            letterSpacing: 1.2,
            textTransform: "uppercase",
            color: tokens.textTer,
            textAlign: "center",
          }}
        >
          {minutesLabel}
        </Text>
      </View>
    </View>
  );
}
