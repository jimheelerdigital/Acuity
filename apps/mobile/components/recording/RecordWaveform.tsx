import { memo, useEffect, useMemo, useRef, useState } from "react";
import { useWindowDimensions, View } from "react-native";
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import { useTheme } from "@/contexts/theme-context";

/**
 * RecordWaveform — Apple Voice Memos style scrolling bar histogram.
 *
 * Q5 polish 4 (2026-05-20): the prior smooth-line cut still glitched
 * on iPhone 16e because the path was recomputed per-frame via a heavy
 * worklet (string concat × 96 sample points). Replaced with the
 * canonical "infinite scroll" architecture used by Voice Memos:
 *
 *   - The bar layout is a horizontal row of static <View>s. Each bar's
 *     height encodes the amplitude at its sample-time; that height
 *     never changes — the bar is a historical record.
 *   - A single container <Animated.View> has translateX driven by a
 *     Reanimated shared value. The container scrolls leftward at a
 *     steady rate (SLOT_WIDTH px per SAMPLE_INTERVAL_MS).
 *   - On each new mic sample (the parent re-renders us with a new
 *     `levels` array), we (a) shift the JS bars array — drop oldest
 *     left, push newest right — and (b) reset translateX to 0, then
 *     re-animate it to -SLOT_WIDTH over SAMPLE_INTERVAL_MS. The two
 *     happen atomically, so the visual is seamless: the bar that was
 *     at slot k-1 (translated -SLOT_WIDTH) is now at slot k-1
 *     (translated 0). No jump.
 *
 * Only one transform animates per frame. JS-side work happens at the
 * 1 Hz sample rate. No worklet-string-building, no path attr churn.
 *
 * Visual details:
 *   - Bars rise symmetrically from a horizontal centerline. Rounded
 *     caps. Width ~2.5pt, gap ~2pt. Matches Voice Memos density.
 *   - Bar color interpolates linearly between tokens.primary (oldest
 *     bar, leftmost) and tokens.secondary (newest, rightmost). Single
 *     lerp pass at render time — zero LinearGradient instances.
 *   - Opacity fades on the left ~18% of the bars so they appear to
 *     scroll off rather than abruptly disappear. Same JS-time pass.
 *   - Noise floor (12%) ensures bars are never zero-height; the strip
 *     reads as a constant ripple at silence.
 *   - Pauses cleanly when active=false; bars freeze at last state and
 *     dim to 0.5 opacity.
 */

const BAR_WIDTH = 2.5;
const BAR_GAP = 2;
const SLOT_WIDTH = BAR_WIDTH + BAR_GAP;
const SAMPLE_INTERVAL_MS = 1000;
const NOISE_FLOOR = 0.12;
const FADE_FRACTION = 0.18;

export interface RecordWaveformProps {
  /** Rolling-window amplitude values 0..1. From expo-av's metering callback. */
  levels: number[];
  /** Render dim when not actively recording. */
  active: boolean;
  /** Strip height in pt. Default 80 per design. */
  height?: number;
}

interface Bar {
  id: string;
  amp: number;
}

/**
 * Linear hex-color interpolation. Accepts `#rrggbb`; ignores alpha.
 * Used at render time to color each bar — much cheaper than rendering
 * N LinearGradient components.
 */
function lerpHex(a: string, b: string, t: number): string {
  const parse = (h: string) => {
    const hex = h.replace("#", "");
    return [
      parseInt(hex.slice(0, 2), 16),
      parseInt(hex.slice(2, 4), 16),
      parseInt(hex.slice(4, 6), 16),
    ];
  };
  const [ar, ag, ab] = parse(a);
  const [br, bg, bb] = parse(b);
  const mix = (x: number, y: number) => Math.round(x + (y - x) * t);
  const toHex = (v: number) =>
    Math.max(0, Math.min(255, v)).toString(16).padStart(2, "0");
  return `#${toHex(mix(ar, br))}${toHex(mix(ag, bg))}${toHex(mix(ab, bb))}`;
}

export function RecordWaveform({
  levels,
  active,
  height = 80,
}: RecordWaveformProps) {
  const { tokens } = useTheme();
  const { width: screenWidth } = useWindowDimensions();
  // Parent wraps the recording surface in px-8 = 32 each side.
  const stripWidth = Math.max(0, screenWidth - 64);

  // Number of bars to render. +1 so the off-screen-right slot has a
  // bar waiting to scroll in as translateX advances.
  const numBars = useMemo(
    () => Math.max(8, Math.ceil(stripWidth / SLOT_WIDTH) + 1),
    [stripWidth]
  );

  // JS state: the bars array. Newest bar is the last element. The
  // shift+push happens once per sample arrival (1 Hz).
  const initialBars = useMemo<Bar[]>(
    () =>
      Array.from({ length: numBars }, (_, i) => ({
        id: `init-${i}`,
        amp: NOISE_FLOOR,
      })),
    [numBars]
  );
  const [bars, setBars] = useState<Bar[]>(initialBars);

  // Reanimated shared value for the container translateX.
  const translateX = useSharedValue(0);

  // Track the previous `levels` reference so the very first effect
  // call (on mount) doesn't push a bogus bar.
  const prevLevelsRef = useRef<number[] | null>(null);

  // On each new mic sample (levels reference changes), shift the bars
  // array and reset the scroll animation. The reset is what makes the
  // transition seamless — bar that was visually at slot k now sits at
  // slot k from translateX=0's perspective.
  useEffect(() => {
    if (!active) return;
    if (prevLevelsRef.current === levels) return; // first mount or no-op
    prevLevelsRef.current = levels;
    const latestAmp = levels[levels.length - 1] ?? NOISE_FLOOR;
    setBars((prev) => {
      const next = prev.slice(1);
      next.push({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        amp: latestAmp,
      });
      return next;
    });
    cancelAnimation(translateX);
    translateX.value = 0;
    translateX.value = withTiming(-SLOT_WIDTH, {
      duration: SAMPLE_INTERVAL_MS,
      easing: Easing.linear,
    });
  }, [levels, active, translateX]);

  // Pause + dim cleanly when leaving the recording state. Re-arm on
  // the next start (fresh bars + zeroed translate).
  useEffect(() => {
    if (active) {
      // Fresh recording: reset to a clean strip so we don't keep
      // showing bars from the prior session.
      setBars(initialBars);
      translateX.value = 0;
      prevLevelsRef.current = null;
    } else {
      cancelAnimation(translateX);
    }
  }, [active, initialBars, translateX]);

  const containerStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  // Pre-compute per-bar color + opacity once per bars change. The
  // fade ramps 0 → 1 across the first FADE_FRACTION of the array.
  const fadeEndIdx = numBars * FADE_FRACTION;
  const barViews = useMemo(
    () =>
      bars.map((bar, idx) => {
        const colorT = numBars <= 1 ? 1 : idx / (numBars - 1);
        const color = lerpHex(tokens.primary, tokens.secondary, colorT);
        const opacity = idx >= fadeEndIdx ? 1 : idx / fadeEndIdx;
        const amp = Math.max(NOISE_FLOOR, Math.min(1, bar.amp));
        return {
          id: bar.id,
          color,
          opacity,
          // Bar's actual drawn height. The Bar component centers it
          // on the strip's vertical midline.
          barHeight: Math.max(4, amp * height * 0.86),
        };
      }),
    [bars, fadeEndIdx, height, numBars, tokens.primary, tokens.secondary]
  );

  if (stripWidth <= 0) return <View style={{ height }} />;

  return (
    <View
      style={{
        width: stripWidth,
        height,
        alignSelf: "center",
        overflow: "hidden",
        opacity: active ? 1 : 0.5,
      }}
    >
      <Animated.View
        style={[
          {
            position: "absolute",
            top: 0,
            // Anchor the container so bar[numBars-1] (newest) sits
            // exactly at the right edge when translateX === 0. The
            // -SLOT_WIDTH translation then pulls everything left by
            // exactly one slot over the sample interval.
            left: stripWidth - (numBars - 1) * SLOT_WIDTH - BAR_WIDTH,
            flexDirection: "row",
            alignItems: "center",
            height,
          },
          containerStyle,
        ]}
      >
        {barViews.map((b) => (
          <BarView
            key={b.id}
            color={b.color}
            opacity={b.opacity}
            barHeight={b.barHeight}
          />
        ))}
      </Animated.View>
    </View>
  );
}

interface BarViewProps {
  color: string;
  opacity: number;
  barHeight: number;
}

const BarView = memo(function BarView({
  color,
  opacity,
  barHeight,
}: BarViewProps) {
  // Outer column reserves SLOT_WIDTH horizontal space; inner pill
  // is the visible bar. Centered vertically via parent alignItems.
  return (
    <View
      style={{
        width: BAR_WIDTH,
        marginRight: BAR_GAP,
        alignItems: "center",
        justifyContent: "center",
        opacity,
      }}
    >
      <View
        style={{
          width: BAR_WIDTH,
          height: barHeight,
          borderRadius: BAR_WIDTH / 2,
          backgroundColor: color,
        }}
      />
    </View>
  );
});
