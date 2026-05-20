import type { ReactNode } from "react";
import type { ComponentType } from "react";
import { useEffect } from "react";
import { View } from "react-native";
import Animated, {
  Easing,
  useAnimatedProps,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import Svg, {
  Circle,
  Defs,
  LinearGradient as SvgLinearGradient,
  Stop,
  type CircleProps,
} from "react-native-svg";

import { useTheme } from "@/contexts/theme-context";

/**
 * RingProgress — SVG circular progress with gradient stroke + center slot.
 *
 * Animation #3 from the motion gallery (Stat count-up): when `value`
 * changes the stroke fills with an 850ms easeOutCubic transition. The
 * center children should also count up — see GradientText / consumers
 * for the matching number tween. Triggered by `useFocusEffect` in the
 * consumer screen so a re-mount restarts the animation; passing the
 * same `value` twice is a no-op.
 *
 * Gradient stops default to the active palette's primary → secondary
 * (the warm-to-cool sweep used on Home + Insights). Override with
 * `gradientColors` for theme-hued rings (e.g., per-axis goal rings).
 *
 * Stroke linecap is `round` so the head of the arc visually pops; this
 * matches the design canvas exactly.
 */

// react-native-svg's CircleProps type only lists cx/cy/r as
// reanimated-animatable surface (strokeDashoffset is inherited from
// SVGAttributes but not narrowed into the animatable set). Widen the
// component type so animatedProps accepts the stroke dash we drive.
const AnimatedCircle = Animated.createAnimatedComponent(
  Circle as ComponentType<CircleProps & { strokeDashoffset?: number }>
);

export interface RingProgressProps {
  /** 0..100. Values outside the range are clamped. */
  value: number;
  /** Diameter in pt. Default 96 matches the design's hero ring. */
  size?: number;
  /** Stroke width. Default 8 matches the hero ring; chunkier for tiles. */
  strokeWidth?: number;
  /** Two-stop gradient. Defaults to active palette primary → secondary. */
  gradientColors?: [string, string];
  /** Disable animation — pass `false` for static initial render. */
  animated?: boolean;
  /** Center content. Pass <Text>, a number, or any node. */
  children?: ReactNode;
}

// easeOutCubic per motion gallery spec.
const EASE_OUT_CUBIC = Easing.bezier(0.16, 0.9, 0.3, 1);
const DURATION_MS = 850;

export function RingProgress({
  value,
  size = 96,
  strokeWidth = 8,
  gradientColors,
  animated = true,
  children,
}: RingProgressProps) {
  const { tokens, resolved } = useTheme();
  const clamped = Math.max(0, Math.min(100, value));

  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  const progress = useSharedValue(animated ? 0 : clamped);

  useEffect(() => {
    if (!animated) {
      progress.value = clamped;
      return;
    }
    progress.value = withTiming(clamped, {
      duration: DURATION_MS,
      easing: EASE_OUT_CUBIC,
    });
  }, [clamped, animated, progress]);

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: circumference * (1 - progress.value / 100),
  }));

  // Stable ID per palette-pair so React doesn't churn gradient defs.
  const [stop1, stop2] = gradientColors ?? [tokens.primary, tokens.secondary];
  const gradientId = `ring-${stop1.slice(1)}-${stop2.slice(1)}`;
  const trackColor =
    resolved === "dark" ? "#ffffff14" : "#00000010"; // matches design

  return (
    <View style={{ width: size, height: size }}>
      <Svg
        width={size}
        height={size}
        // Rotate so 0% sits at 12 o'clock and fills clockwise.
        style={{ transform: [{ rotate: "-90deg" }] }}
      >
        <Defs>
          <SvgLinearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0%" stopColor={stop1} />
            <Stop offset="100%" stopColor={stop2} />
          </SvgLinearGradient>
        </Defs>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={trackColor}
          strokeWidth={strokeWidth}
        />
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={`url(#${gradientId})`}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={`${circumference} ${circumference}`}
          animatedProps={animatedProps}
        />
      </Svg>
      {children !== undefined && (
        <View
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {children}
        </View>
      )}
    </View>
  );
}
