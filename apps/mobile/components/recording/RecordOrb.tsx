import { useEffect } from "react";
import type { ComponentType } from "react";
import { Platform, Pressable } from "react-native";
import Animated, {
  Easing,
  useAnimatedProps,
  useAnimatedStyle,
  useFrameCallback,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import Svg, {
  Defs,
  LinearGradient as SvgLinearGradient,
  Path,
  Stop,
  type PathProps,
} from "react-native-svg";

import { useTheme } from "@/contexts/theme-context";

/**
 * RecordOrb — lava-lamp blob.
 *
 * Q5 polish 7 (2026-05-20): the prior implementations (corner-radius
 * oscillation + specular highlight, then specular removed but
 * corners only ±6%) still read as a glossy ball. Rewrote as an
 * SVG closed-path morph: 8 control points around the orb's
 * circumference, each oscillating radially with its own slow sine
 * wave at a unique period (primes-ish to prevent resonance), smoothed
 * via Catmull-Rom→Bezier into a continuous curve.
 *
 * Result: a clearly organic shape that's visibly asymmetric on every
 * frame — never reads as a perfect circle.
 *
 * Animation layers (additive):
 *   - Shape: 8 radial oscillators driven by a monotonically-growing
 *     `elapsed` shared value (via useFrameCallback). Each point's
 *     radius = BASE_RADIUS * (1 + sin(elapsed/period + phase_offset)
 *     * RADIAL_AMPLITUDE). RADIAL_AMPLITUDE = ±18% per spec.
 *   - Amplitude pulse: scale 1.0 → 1.18 mapped to mic amplitude.
 *     Applied as a transform on the SVG wrapper so it rides on top
 *     of the blob shape. Same as previous cuts.
 *   - Halo: scale + opacity reactive to amplitude. Unchanged from
 *     previous cuts per spec.
 *   - Idle: the slow shape morph IS the breathing — no separate
 *     idle scale-breath. Per spec.
 *
 * Fill: SVG LinearGradient (primaryHi → primary → secondary). No
 * specular highlight, no rotated overlay, no top-left gloss.
 *
 * useFrameCallback runs the elapsed-increment worklet every UI frame
 * regardless of recording state — the blob shape morphs continuously
 * in both idle and active states (per spec). The increment is
 * UI-thread cheap (one float add).
 */

const SIZE = 88;
const HALO_SIZE = SIZE + 32;
// SVG canvas wide enough for the maximum radial excursion. At
// BASE_RADIUS 44 and ±18% expansion, max radius = 51.92; bounding
// box edge needs at least 2 * 51.92 = 103.84. Add a few px so the
// gradient and any anti-alias on the path edge don't clip.
const ORB_BOX = 116;
const ORB_CENTER = ORB_BOX / 2;
const BASE_RADIUS = SIZE / 2;
const N_POINTS = 8;
const RADIAL_AMPLITUDE = 0.18;
// Independent slow periods per control point. Primes-ish to avoid
// resonance so the shape never repeats the exact same configuration.
const PERIODS_MS = [2800, 3400, 4100, 4700, 5300, 6100, 3700, 5700] as const;
// Initial phase offsets so the orb is visibly asymmetric on the
// very first frame (not a circle waiting to morph).
const PHASE_OFFSETS = [0, 0.7, 1.4, 2.1, 2.8, 3.5, 4.2, 4.9] as const;

const AMPLITUDE_TIMING_MS = 100;
const IDLE_THRESHOLD = 0.06;

// Reanimated v4's animatedProps surface on PathProps doesn't include
// `d` as animatable — same workaround pattern as RingProgress.
const AnimatedPath = Animated.createAnimatedComponent(
  Path as ComponentType<PathProps & { d?: string }>
);

export interface RecordOrbProps {
  /** Latest mic amplitude in [0, 1]. Pass the most recent levels[] tail. */
  amplitude: number;
  /** True when state === "recording". Drives the amplitude pulse. */
  active: boolean;
  onPress: () => void;
  accessibilityLabel?: string;
}

export function RecordOrb({
  amplitude,
  active,
  onPress,
  accessibilityLabel,
}: RecordOrbProps) {
  const { tokens } = useTheme();
  const reactive = useSharedValue(0);
  const elapsed = useSharedValue(0);

  // Amplitude → reactive scale + halo. Same mapping as polish 1.
  useEffect(() => {
    const target =
      active && amplitude > IDLE_THRESHOLD
        ? Math.max(0, Math.min(1, amplitude))
        : 0;
    reactive.value = withTiming(target, {
      duration: AMPLITUDE_TIMING_MS,
      easing: Easing.out(Easing.quad),
    });
  }, [amplitude, active, reactive]);

  // Frame-driven elapsed time — grows monotonically forever. Drives
  // the shape oscillators inside the path worklet. useFrameCallback
  // runs on the UI thread, one float add per frame; no perceptible
  // cost. JS-side number precision stays clean for many hours of
  // continuous animation.
  useFrameCallback((frameInfo) => {
    elapsed.value += frameInfo.timeSincePreviousFrame ?? 16;
  });

  const haloStyle = useAnimatedStyle(() => ({
    opacity: 0.3 + reactive.value * 0.55,
    transform: [{ scale: 1 + reactive.value * 0.3 }],
  }));

  const orbScaleStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + reactive.value * 0.18 }],
  }));

  // Path worklet — runs every UI frame because elapsed updates every
  // frame via useFrameCallback. ~8 cubic Bezier segments, ~400 chars
  // of string concat per frame. Well within worklet budget.
  const animatedProps = useAnimatedProps(() => {
    const t = elapsed.value;
    const xs: number[] = [];
    const ys: number[] = [];
    for (let i = 0; i < N_POINTS; i += 1) {
      const angle = (i / N_POINTS) * 2 * Math.PI;
      const phase =
        (t / PERIODS_MS[i]) * 2 * Math.PI + PHASE_OFFSETS[i];
      const r = BASE_RADIUS * (1 + Math.sin(phase) * RADIAL_AMPLITUDE);
      xs.push(ORB_CENTER + r * Math.cos(angle));
      ys.push(ORB_CENTER + r * Math.sin(angle));
    }

    // Catmull-Rom → cubic Bezier closed loop. Wraparound indices for
    // p0 and p3 so the curve closes smoothly back to its start.
    let d = "";
    for (let i = 0; i < N_POINTS; i += 1) {
      const p0 = (i - 1 + N_POINTS) % N_POINTS;
      const p1 = i;
      const p2 = (i + 1) % N_POINTS;
      const p3 = (i + 2) % N_POINTS;
      const cp1x = xs[p1] + (xs[p2] - xs[p0]) / 6;
      const cp1y = ys[p1] + (ys[p2] - ys[p0]) / 6;
      const cp2x = xs[p2] - (xs[p3] - xs[p1]) / 6;
      const cp2y = ys[p2] - (ys[p3] - ys[p1]) / 6;
      if (i === 0) {
        d = "M " + xs[p1].toFixed(1) + " " + ys[p1].toFixed(1);
      }
      d +=
        " C " +
        cp1x.toFixed(1) +
        " " +
        cp1y.toFixed(1) +
        " " +
        cp2x.toFixed(1) +
        " " +
        cp2y.toFixed(1) +
        " " +
        xs[p2].toFixed(1) +
        " " +
        ys[p2].toFixed(1);
    }
    return { d: d + " Z" };
  });

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={
        accessibilityLabel ?? (active ? "Stop recording" : "Start recording")
      }
      hitSlop={20}
      style={{
        width: HALO_SIZE,
        height: HALO_SIZE,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {/* Halo — soft glow disc behind the orb. Stays circular per spec. */}
      <Animated.View
        pointerEvents="none"
        style={[
          {
            position: "absolute",
            width: HALO_SIZE,
            height: HALO_SIZE,
            borderRadius: HALO_SIZE / 2,
            backgroundColor: `${tokens.primary}55`,
          },
          haloStyle,
        ]}
      />

      {/* Orb body — SVG blob path with amplitude-driven scale. */}
      <Animated.View
        style={[
          {
            width: ORB_BOX,
            height: ORB_BOX,
            // Glow per design § "Glow rule" — orb is one of the four
            // sanctioned surfaces. Shadow approximates the design's
            // `0 8px 24px primary/0.55`.
            shadowColor: tokens.primary,
            shadowOffset: { width: 0, height: 8 },
            shadowRadius: 24,
            shadowOpacity: Platform.OS === "ios" ? 0.55 : 0,
            elevation: 10,
          },
          orbScaleStyle,
        ]}
      >
        <Svg width={ORB_BOX} height={ORB_BOX}>
          <Defs>
            <SvgLinearGradient
              id="orb-blob-grad"
              x1={ORB_BOX * 0.35}
              y1={ORB_BOX * 0.3}
              x2={ORB_BOX * 0.7}
              y2={ORB_BOX}
              gradientUnits="userSpaceOnUse"
            >
              <Stop offset="0" stopColor={tokens.primaryHi} />
              <Stop offset="0.5" stopColor={tokens.primary} />
              <Stop offset="1" stopColor={tokens.secondary} />
            </SvgLinearGradient>
          </Defs>
          <AnimatedPath
            animatedProps={animatedProps}
            fill="url(#orb-blob-grad)"
          />
        </Svg>
      </Animated.View>
    </Pressable>
  );
}
