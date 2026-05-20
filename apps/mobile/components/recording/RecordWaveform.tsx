import type { ComponentType } from "react";
import { useEffect } from "react";
import { useWindowDimensions, View } from "react-native";
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedProps,
  useSharedValue,
  withRepeat,
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
 * RecordWaveform — Apple-Voice-Memos-flavored live waveform.
 *
 * Q5 polish 2 (2026-05-20): the prior cut redrew a static mirrored
 * ribbon on each `levels` change, which locked the visual cadence to
 * the 1 Hz expo-av sample rate and read as dead. This rewrite uses a
 * Reanimated worklet that recomputes the SVG `d` attribute every UI
 * frame from three shared values:
 *
 *   - `phase` (linear withRepeat) — drives a continuous leftward
 *     sine scroll. Wave is always wiggling even at silence.
 *   - `scrollFrac` (0→1 over 1s after each sample) — smooth sub-
 *     bucket interpolation so the history scrolls between mic
 *     samples instead of ticking.
 *   - `historyShared` (mirror of the levels prop) — provides the
 *     scrolling amplitude envelope; spikes from past speech move
 *     leftward across the strip.
 *
 * Composition:
 *   - Single SVG <Path>, gradient stroke (primary→secondary), ~2pt
 *     line, rounded caps.
 *   - Symmetric around centerline: y(x) = center + envelope * sin(...)
 *     — single oscillating line, not a mirrored ribbon.
 *   - Edge fade on the left via gradient stop alpha (oldest samples
 *     dissolve into the strip start).
 *
 * The audio capture, /api/record path, and levels[] producer are all
 * unchanged. This component is purely a consumer of the existing
 * 1 Hz amplitude signal; no new audio listeners.
 */

const NOISE_FLOOR = 0.07;
const STROKE_WIDTH = 2.2;
const SAMPLE_POINTS = 96;
const SCROLL_PERIOD_MS = 4200;
const SAMPLE_INTERVAL_MS = 1000;
// Two wave numbers — composing two slightly-detuned sines breaks the
// "perfectly periodic" look that a single sine would have. The 1.84
// ratio is irrational-adjacent so the two components never repeat
// the same composite shape twice.
const K1 = 0.085;
const K2 = K1 * 1.84;

// Reanimated v4's animatedProps surface on Path's PathProps doesn't
// include `d` as animatable — same workaround pattern as RingProgress.
const AnimatedPath = Animated.createAnimatedComponent(
  Path as ComponentType<PathProps & { d?: string }>
);

export interface RecordWaveformProps {
  /** Rolling-window amplitude values 0..1. From expo-av's metering callback. */
  levels: number[];
  /** Render dim when not actively recording. */
  active: boolean;
  /** Strip height in pt. Default 80 per design. */
  height?: number;
}

export function RecordWaveform({
  levels,
  active,
  height = 80,
}: RecordWaveformProps) {
  const { tokens } = useTheme();
  const { width: screenWidth } = useWindowDimensions();
  // Parent wraps recording surface in px-8 = 32 each side.
  const stripWidth = Math.max(0, screenWidth - 64);

  const phase = useSharedValue(0);
  const scrollFrac = useSharedValue(0);
  const historyShared = useSharedValue<number[]>(
    levels.length > 0 ? [...levels] : new Array(8).fill(NOISE_FLOOR)
  );

  // Replace the history mirror whenever the parent updates levels.
  // Reset the sub-bucket scroll so the freshly-pushed sample animates
  // leftward over the next sample interval (linear).
  useEffect(() => {
    if (levels.length === 0) return;
    historyShared.value = [...levels];
    scrollFrac.value = 0;
    scrollFrac.value = withTiming(1, {
      duration: SAMPLE_INTERVAL_MS,
      easing: Easing.linear,
    });
  }, [levels, historyShared, scrollFrac]);

  // Phase animation — keyed on `active` so the wave only animates
  // while recording. withRepeat(linear, infinite) drives the worklet
  // to re-evaluate every UI frame. The 0→2π target is replayed each
  // iteration; sin(0) === sin(2π) so the snap is seamless.
  useEffect(() => {
    if (active) {
      phase.value = 0;
      phase.value = withRepeat(
        withTiming(2 * Math.PI, {
          duration: SCROLL_PERIOD_MS,
          easing: Easing.linear,
        }),
        -1,
        false
      );
    } else {
      cancelAnimation(phase);
    }
    return () => {
      cancelAnimation(phase);
    };
  }, [active, phase]);

  const centerY = height / 2;
  const maxAmp = height * 0.42;

  const animatedProps = useAnimatedProps(() => {
    const hist = historyShared.value;
    const histLen = hist.length;
    if (histLen === 0 || stripWidth <= 0) {
      return { d: "" };
    }
    const phaseV = phase.value;
    const scrollV = scrollFrac.value;

    // Worklet-local string accumulator. Concat with `+=` to avoid
    // building intermediate arrays — worklet perf matters here
    // because this fires every UI frame.
    let d = "";
    for (let i = 0; i < SAMPLE_POINTS; i += 1) {
      const normX = i / (SAMPLE_POINTS - 1);
      const x = stripWidth * normX;

      // Map x to a history bucket. Right edge at scrollV=0 reads
      // history[histLen-1] (newest). As scrollV → 1, every visible
      // x slides leftward by one bucket-width; the right edge then
      // clamps to histLen-1 (holds the latest sample until a new
      // sample arrives and the parent shifts the array, restoring
      // continuity). See top-of-file comment for the geometry.
      const bucketF = (histLen - 1) * normX + scrollV;
      const bucketLo = Math.floor(bucketF);
      const bucketHi = bucketLo + 1;
      const frac = bucketF - bucketLo;
      const safeLo = Math.max(0, Math.min(histLen - 1, bucketLo));
      const safeHi = Math.max(0, Math.min(histLen - 1, bucketHi));
      const ampLo = hist[safeLo];
      const ampHi = hist[safeHi];
      const sampledAmp = ampLo * (1 - frac) + ampHi * frac;

      // Edge fade — first 12% of the strip ramps in from 0; the
      // last 4% on the right is full strength so newly-arrived
      // samples land cleanly. The fade out at the left is what
      // makes scrolled-off-screen spikes disappear gracefully.
      const leftFade = normX < 0.12 ? normX / 0.12 : 1;
      const rightTrim = 1; // no right fade — keep right edge crisp

      // Envelope: amplitude envelope with noise floor + left fade.
      const env = Math.max(NOISE_FLOOR, sampledAmp) * leftFade * rightTrim;

      // Composite two sines at detuned frequencies for organic motion.
      const wave =
        Math.sin(K1 * x - phaseV) * 0.65 +
        Math.sin(K2 * x - phaseV * 1.4 + 0.7) * 0.35;

      const y = centerY + env * maxAmp * wave;

      if (i === 0) {
        d = "M " + x.toFixed(1) + " " + y.toFixed(1);
      } else {
        d = d + " L " + x.toFixed(1) + " " + y.toFixed(1);
      }
    }
    return { d };
  });

  if (stripWidth <= 0) return <View style={{ height }} />;

  return (
    <View
      style={{
        height,
        width: stripWidth,
        opacity: active ? 1 : 0.55,
        alignSelf: "center",
      }}
    >
      <Svg width={stripWidth} height={height}>
        <Defs>
          <SvgLinearGradient
            id="waveform-grad"
            x1="0"
            y1="0"
            x2="1"
            y2="0"
          >
            {/* Left-edge alpha fade — older samples dissolve into
                the strip start. Right edge stays opaque so newly-
                arrived samples land with full presence. */}
            <Stop offset="0%" stopColor={tokens.primary} stopOpacity={0} />
            <Stop offset="12%" stopColor={tokens.primary} stopOpacity={0.9} />
            <Stop offset="55%" stopColor={tokens.primary} stopOpacity={1} />
            <Stop offset="100%" stopColor={tokens.secondary} stopOpacity={1} />
          </SvgLinearGradient>
        </Defs>
        <AnimatedPath
          animatedProps={animatedProps}
          stroke="url(#waveform-grad)"
          strokeWidth={STROKE_WIDTH}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </Svg>
    </View>
  );
}
