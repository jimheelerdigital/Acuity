import { useEffect } from "react";
import { View } from "react-native";
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import Svg, { Circle } from "react-native-svg";

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/**
 * 140pt circular hold target with a progress ring. Slice 7 (2026-05-26).
 *
 * Three visual layers:
 *   1. Outer SVG ring — strokeDashoffset animates from full
 *      circumference to 0 over the hold duration, revealing the
 *      progress arc starting at 12 o'clock.
 *   2. Inner filled circle — purple gradient-ish solid; pre-touch
 *      breathing animation (scale 0.98 ↔ 1.02 on a 1.5s loop) stops
 *      when holding begins.
 *   3. Center label — passed in as `children`. Caller renders the
 *      copy ("Hold to commit", duration, etc.).
 *
 * Props:
 *   - holding: true while the user's finger is down. Drives both
 *     the breathing-stop and the progress-fill direction.
 *   - holdDurationMs: total hold time the ring fills over (3000 by
 *     spec). Released-before-completion resets the ring to 0 over
 *     RESET_MS.
 *   - reduceMotion: when true, breathing is skipped, the ring snaps
 *     full on press without animating, and the spring-back on
 *     release is instant. The 3s hold requirement still applies —
 *     the screen owns the timing; this is purely visual.
 *
 * Reanimated 4 worklets used:
 *   - progress (0..1) drives strokeDashoffset via useAnimatedProps
 *   - breath (0.98..1.02) drives the inner-circle scale transform
 *
 * SVG sizing math:
 *   diameter = 140, stroke = 6, radius = (140 - 6) / 2 = 67
 *   circumference = 2 × π × 67 ≈ 420.97
 */

const SIZE = 140;
const STROKE = 6;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const RESET_MS = 280;
const BREATH_PERIOD_MS = 1500;
const BREATH_MIN = 0.98;
const BREATH_MAX = 1.02;

const EASE_LINEAR = Easing.linear;
const EASE_CUBIC_OUT = Easing.bezier(0.215, 0.61, 0.355, 1);

export function CommitmentRing({
  holding,
  holdDurationMs,
  reduceMotion,
  ringColor,
  trackColor,
  fillColor,
  children,
}: {
  holding: boolean;
  holdDurationMs: number;
  reduceMotion: boolean;
  ringColor: string;
  trackColor: string;
  fillColor: string;
  children?: React.ReactNode;
}) {
  // 0 = empty, 1 = filled
  const progress = useSharedValue(0);
  const breath = useSharedValue(1);

  // Drive the ring fill.
  useEffect(() => {
    if (holding) {
      cancelAnimation(progress);
      if (reduceMotion) {
        progress.value = 1;
      } else {
        progress.value = withTiming(1, {
          duration: holdDurationMs,
          easing: EASE_LINEAR,
        });
      }
    } else {
      cancelAnimation(progress);
      if (reduceMotion) {
        progress.value = 0;
      } else {
        progress.value = withTiming(0, {
          duration: RESET_MS,
          easing: EASE_CUBIC_OUT,
        });
      }
    }
    // progress is a sharedValue ref, stable by Reanimated contract.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [holding, holdDurationMs, reduceMotion]);

  // Breathing — only active when not holding AND motion is allowed.
  useEffect(() => {
    if (reduceMotion || holding) {
      cancelAnimation(breath);
      breath.value = 1;
      return;
    }
    cancelAnimation(breath);
    breath.value = withRepeat(
      withTiming(BREATH_MAX, {
        duration: BREATH_PERIOD_MS,
        easing: EASE_CUBIC_OUT,
      }),
      -1,
      true
    );
    // Initialize toward min so the cycle reads correctly.
    breath.value = BREATH_MIN;
    breath.value = withRepeat(
      withTiming(BREATH_MAX, {
        duration: BREATH_PERIOD_MS,
        easing: EASE_CUBIC_OUT,
      }),
      -1,
      true
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [holding, reduceMotion]);

  // Cast through `as never` to bypass the Reanimated 4 + RN-svg
  // type-boundary mismatch — same pattern used elsewhere in the
  // codebase (theme-map LockedState). The runtime value is a
  // standard Circle prop.
  const ringProps = useAnimatedProps(
    () => ({
      strokeDashoffset: CIRCUMFERENCE * (1 - progress.value),
    }) as never
  );

  const innerStyle = useAnimatedStyle(() => ({
    transform: [{ scale: breath.value }],
  }));

  return (
    <View
      style={{
        width: SIZE,
        height: SIZE,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {/* SVG ring — rotate -90deg so the fill starts at 12 o'clock
          rather than 3 o'clock (SVG default). */}
      <Svg
        width={SIZE}
        height={SIZE}
        style={{ position: "absolute", transform: [{ rotate: "-90deg" }] }}
      >
        <Circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          stroke={trackColor}
          strokeWidth={STROKE}
          fill="transparent"
        />
        <AnimatedCircle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          stroke={ringColor}
          strokeWidth={STROKE}
          fill="transparent"
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          animatedProps={ringProps}
        />
      </Svg>

      {/* Inner filled disc — sits inside the ring. Breathes pre-hold. */}
      <Animated.View
        style={[
          innerStyle,
          {
            width: SIZE - STROKE * 4,
            height: SIZE - STROKE * 4,
            borderRadius: (SIZE - STROKE * 4) / 2,
            backgroundColor: fillColor,
            alignItems: "center",
            justifyContent: "center",
          },
        ]}
      >
        {children}
      </Animated.View>
    </View>
  );
}
