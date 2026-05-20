import { useEffect } from "react";
import type { ComponentType } from "react";
import { Platform, Pressable, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedProps,
  useFrameCallback,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import Svg, {
  Circle,
  Defs,
  Path,
  RadialGradient as SvgRadialGradient,
  Stop,
  type PathProps,
} from "react-native-svg";

import { useTheme } from "@/contexts/theme-context";

/**
 * RecordOrb — MorphOrb port (Slice Q5 polish 8, 2026-05-20).
 *
 * Direct port of `_design/orb_update/screen-recording.jsx → MorphOrb`
 * (the picked direction from Claude Design's variation-A exploration).
 * Replaces the polish-7 8-point implementation with the spec's
 * 5-point morph at tension 0.18.
 *
 * Shape (always on, idle + active):
 *   - 5 control points evenly spaced around `baseR`.
 *   - r_i = baseR + sin(elapsed * freq[i] + phase[i]) * amp[i]
 *   - Catmull-Rom cardinal-spline smoothing at tension 0.18 — slightly
 *     curvier than the 1/6 (≈0.167) we were using before, matching
 *     the spec exactly.
 *   - 5 phases: [0, 1.1, 2.3, 4.0, 5.5] rad
 *   - Idle: amps [3.5, 3.0, 4.0, 3.2, 3.6] (≈±4–6% of baseR=62);
 *           freqs [0.00080, 0.00065, 0.00095, 0.00075, 0.00085] rad/ms
 *           → 6.5–9.7s wobble cycles
 *   - Active: amps [5.5, 5.0, 6.0, 5.2, 5.6] (≈±6.5%);
 *             freqs roughly 2× idle → ~3.3–4.8s cycles
 *
 * Active state is interpolated via `stateMix` (0 = idle, 1 = active)
 * over 600ms with withTiming so the freq+amp transition between states
 * is smooth — spec doesn't require this, but a discrete snap on
 * idle↔active is visibly jarring on a continuous animation.
 *
 * Amplitude pulse (active only):
 *   - Scale 1.0 → 1.14, mapped to smoothed mic amplitude (~80ms ema
 *     via withTiming).
 *   - Applied as an extra multiplier inside the path math so the
 *     halo stays at fixed size (per spec) — only the orb body
 *     scales. No separate transform needed.
 *
 * Fill:
 *   - RadialGradient cx=38% cy=34% r=72%, primaryHi → primary (at
 *     55%) → secondary. objectBoundingBox units — gradient anchors
 *     follow the path's current bbox as it morphs.
 *
 * Ambient halo:
 *   - Single radial-gradient Circle at baseR*1.35, fading from
 *     primary @ 18% alpha to primary @ 0% alpha at the edge.
 *   - No separate ring, no outer aura, no scaling pulse — per spec.
 *
 * Animation driver: useFrameCallback increments `elapsed` every UI
 * frame. The path worklet reads elapsed + stateMix + reactive on
 * every frame to build the d string on the UI thread.
 */

const SIZE = 148;
const HALF = SIZE / 2;
const BASE_R = SIZE * 0.42; // ≈ 62
const HALO_R = BASE_R * 1.35;
const N_POINTS = 5;
const TENSION = 0.18;
const SCALE_PULSE_MAX = 0.14;
const STATE_LERP_MS = 600;
const AMP_SMOOTH_MS = 80;
const IDLE_THRESHOLD = 0.06;

// Spec values verbatim from the prototype.
const PHASES = [0, 1.1, 2.3, 4.0, 5.5] as const;
const IDLE_AMPS = [3.5, 3.0, 4.0, 3.2, 3.6] as const;
const ACTIVE_AMPS = [5.5, 5.0, 6.0, 5.2, 5.6] as const;
const IDLE_FREQS = [
  0.00080, 0.00065, 0.00095, 0.00075, 0.00085,
] as const;
const ACTIVE_FREQS = [
  0.0016, 0.0013, 0.0019, 0.0015, 0.0017,
] as const;

// Reanimated v4's animatedProps surface on PathProps doesn't include
// `d` as animatable — same workaround we use elsewhere.
const AnimatedPath = Animated.createAnimatedComponent(
  Path as ComponentType<PathProps & { d?: string }>
);

export interface RecordOrbProps {
  /** Latest mic amplitude in [0, 1]. Pass the most recent levels[] tail. */
  amplitude: number;
  /** True when state === "recording". Switches morph params + enables pulse. */
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
  const elapsed = useSharedValue(0);
  const reactive = useSharedValue(0);
  // 0 → idle params, 1 → active params. Interpolated via withTiming
  // so freq + amp transition smoothly across state changes.
  const stateMix = useSharedValue(active ? 1 : 0);

  // Amplitude smoothing — 80ms ema per spec. Drives the scale pulse.
  useEffect(() => {
    const target =
      active && amplitude > IDLE_THRESHOLD
        ? Math.max(0, Math.min(1, amplitude))
        : 0;
    reactive.value = withTiming(target, {
      duration: AMP_SMOOTH_MS,
      easing: Easing.out(Easing.quad),
    });
  }, [amplitude, active, reactive]);

  // State mix transitions smoothly between idle and active params.
  useEffect(() => {
    stateMix.value = withTiming(active ? 1 : 0, {
      duration: STATE_LERP_MS,
      easing: Easing.inOut(Easing.quad),
    });
  }, [active, stateMix]);

  // Frame-driven elapsed time — grows monotonically. The morph
  // worklet reads it to compute per-point sin wobble each frame.
  useFrameCallback((info) => {
    elapsed.value += info.timeSincePreviousFrame ?? 16;
  });

  // Halo is a static <Circle> inside the SVG — no animated style.
  // The orb body's scale pulse is encoded directly into the path
  // worklet so the halo stays fixed (per spec).

  const animatedProps = useAnimatedProps(() => {
    const t = elapsed.value;
    const mix = stateMix.value;
    // 1.0 at idle, 1.14 at full amplitude during active. Encoded
    // into the path coordinates so the halo doesn't scale with it.
    const pulse = 1 + reactive.value * SCALE_PULSE_MAX;

    const xs: number[] = [];
    const ys: number[] = [];
    for (let i = 0; i < N_POINTS; i += 1) {
      const angle = (i / N_POINTS) * 2 * Math.PI;
      // Linear-interpolate amp + freq between idle and active per
      // point. stateMix transitions over STATE_LERP_MS so flipping
      // active doesn't snap the visible wobble.
      const amp =
        IDLE_AMPS[i] + (ACTIVE_AMPS[i] - IDLE_AMPS[i]) * mix;
      const freq =
        IDLE_FREQS[i] + (ACTIVE_FREQS[i] - IDLE_FREQS[i]) * mix;
      const wob = Math.sin(t * freq + PHASES[i]) * amp;
      const r = (BASE_R + wob) * pulse;
      xs.push(Math.cos(angle) * r);
      ys.push(Math.sin(angle) * r);
    }

    // Catmull-Rom → cubic Bezier closed loop. Tension 0.18 per spec
    // (slightly curvier than the 1/6 we used in polish 7).
    let d = "M " + xs[0].toFixed(2) + " " + ys[0].toFixed(2);
    for (let i = 0; i < N_POINTS; i += 1) {
      const p0 = (i - 1 + N_POINTS) % N_POINTS;
      const p1 = i;
      const p2 = (i + 1) % N_POINTS;
      const p3 = (i + 2) % N_POINTS;
      const c1x = xs[p1] + (xs[p2] - xs[p0]) * TENSION;
      const c1y = ys[p1] + (ys[p2] - ys[p0]) * TENSION;
      const c2x = xs[p2] - (xs[p3] - xs[p1]) * TENSION;
      const c2y = ys[p2] - (ys[p3] - ys[p1]) * TENSION;
      d +=
        " C " +
        c1x.toFixed(2) +
        " " +
        c1y.toFixed(2) +
        ", " +
        c2x.toFixed(2) +
        " " +
        c2y.toFixed(2) +
        ", " +
        xs[p2].toFixed(2) +
        " " +
        ys[p2].toFixed(2);
    }
    return { d: d + " Z" };
  });

  // Outer wrapper is fixed at SIZE — defines the orb's footprint.
  // Glow shadow lives on the wrapper so it follows the orb's
  // bounding box (which is constant; only the path inside morphs).
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={
        accessibilityLabel ?? (active ? "Stop recording" : "Start recording")
      }
      hitSlop={20}
      style={{
        width: SIZE,
        height: SIZE,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <View
        style={{
          width: SIZE,
          height: SIZE,
          // Glow per design § "Glow rule" — orb is one of the four
          // sanctioned glow surfaces. Approximates the design's
          // `0 8px 24px primary/0.45` for the radial-fill orb.
          shadowColor: tokens.primary,
          shadowOffset: { width: 0, height: 8 },
          shadowRadius: 24,
          shadowOpacity: Platform.OS === "ios" ? 0.45 : 0,
          elevation: 10,
        }}
      >
        <Svg
          width={SIZE}
          height={SIZE}
          // Centered viewBox so the path is built around origin.
          viewBox={`-${HALF} -${HALF} ${SIZE} ${SIZE}`}
        >
          <Defs>
            {/* Ambient halo — radial fade from primary @ 18% alpha
                at the center to primary @ 0% alpha at the edge. The
                circle's r=baseR*1.35 sets the visible extent. */}
            <SvgRadialGradient
              id="orb-amb"
              cx="50%"
              cy="50%"
              r="50%"
              fx="50%"
              fy="50%"
            >
              <Stop
                offset="0"
                stopColor={tokens.primary}
                stopOpacity="0.18"
              />
              <Stop
                offset="1"
                stopColor={tokens.primary}
                stopOpacity="0"
              />
            </SvgRadialGradient>
            {/* Orb fill — radial gradient anchored upper-left so the
                orb reads as lit from that direction. primaryHi at
                center → primary at mid → secondary at edge. */}
            <SvgRadialGradient
              id="orb-fill"
              cx="38%"
              cy="34%"
              r="72%"
              fx="38%"
              fy="34%"
            >
              <Stop offset="0" stopColor={tokens.primaryHi} />
              <Stop offset="0.55" stopColor={tokens.primary} />
              <Stop offset="1" stopColor={tokens.secondary} />
            </SvgRadialGradient>
          </Defs>
          {/* Halo circle — static. Doesn't scale with the pulse. */}
          <Circle r={HALO_R} fill="url(#orb-amb)" />
          {/* Orb path — morphs every frame via the worklet. */}
          <AnimatedPath
            animatedProps={animatedProps}
            fill="url(#orb-fill)"
          />
        </Svg>
      </View>
    </Pressable>
  );
}
