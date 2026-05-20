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
 * Q5 polish 6 (2026-05-20): bumped the bar push rate from 1 Hz
 * (matching the mic sample rate) to 8 Hz. At 1 Hz a 73-slot strip
 * took ~73 seconds to fill — Jim's screenshot at 0:15 showed only
 * ~15 bars of real data. Filling at 8 Hz covers the strip in ~9
 * seconds and matches Voice Memos' visual density.
 *
 * Architecture:
 *   - Slot-keyed bars: state is `amps: number[]` of length numBars.
 *     Each slot index is stable across pushes, so the bar at slot k
 *     is permanently mounted; only its height changes when amps
 *     shifts. Better React reconciliation than the prior id-keyed
 *     approach (no mounts/unmounts per push).
 *   - Color is anchored to slot position: bar at slot 0 = primary,
 *     bar at slot N-1 = secondary, linear interpolation between.
 *     As a spike scrolls left, it visually warms from secondary
 *     toward primary — matches user expectation (color = screen
 *     position, not audio-history-id).
 *   - Bar pusher: a 125ms setInterval. Each tick reads the latest
 *     mic amplitude from a ref (latestMicRef, updated by the levels
 *     prop), applies light smoothing toward target + small jitter
 *     for organic variation, then shifts amps + resets translateX
 *     atomically. The shift and the translateX reset together make
 *     the scroll seamless.
 *   - translateX: single Reanimated shared value driving the
 *     container transform. Each push animates 0 → -SLOT_WIDTH over
 *     BAR_PUSH_INTERVAL_MS (linear). Same "infinite scroll" trick
 *     as polish 4, just at 8x the rate.
 *
 * Mic sample arrival (1 Hz from expo-av) updates `latestMicRef` only.
 * The 8 Hz pusher reads from the ref. Between mic samples, 7 bars
 * use the same mic value (with jitter) — gives a "stair-step with
 * texture" pattern that matches Voice Memos showing similar heights
 * during sustained tones.
 *
 * Audio capture, /api/record path, state machine all untouched.
 */

const BAR_WIDTH = 2.5;
const BAR_GAP = 2;
const SLOT_WIDTH = BAR_WIDTH + BAR_GAP;
// 125ms = 8 Hz push rate. Tuned so a 73-slot strip on iPhone 16e
// fills in ~9 seconds — matches Voice Memos' visual cadence
// without taxing React reconciliation too hard (8 setState/sec).
const BAR_PUSH_INTERVAL_MS = 125;
const NOISE_FLOOR = 0.12;
const FADE_FRACTION = 0.18;
// Interpolation toward the target mic value per tick. With 0.55,
// reaching a new amplitude takes ~3 ticks (~375ms) for a clean
// step. Higher = faster response, lower = more lag.
const AMP_LERP = 0.55;
// ±4% random per-bar variation so sustained tones don't look like
// a flat block.
const JITTER_AMP = 0.04;

export interface RecordWaveformProps {
  /** Rolling-window amplitude values 0..1. From expo-av's metering callback. */
  levels: number[];
  /** Render dim when not actively recording. */
  active: boolean;
  /** Strip height in pt. Default 80 per design. */
  height?: number;
}

/**
 * Linear hex-color interpolation. Accepts `#rrggbb`; ignores alpha.
 * Used once per slot at render time — much cheaper than rendering
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

  // Slot config — color + opacity per slot. Slot index is stable
  // across pushes, so this computes once per (numBars, tokens) change.
  // Re-runs when the user switches palettes or the strip resizes.
  const fadeEndIdx = numBars * FADE_FRACTION;
  const slotConfig = useMemo(
    () =>
      Array.from({ length: numBars }, (_, idx) => {
        const colorT = numBars <= 1 ? 1 : idx / (numBars - 1);
        return {
          idx,
          color: lerpHex(tokens.primary, tokens.secondary, colorT),
          opacity: idx >= fadeEndIdx ? 1 : idx / fadeEndIdx,
        };
      }),
    [numBars, fadeEndIdx, tokens.primary, tokens.secondary]
  );

  // Amplitudes per slot. Newest is at the last index.
  const [amps, setAmps] = useState<number[]>(() =>
    new Array(numBars).fill(NOISE_FLOOR)
  );

  // Reanimated shared value for the container translateX.
  const translateX = useSharedValue(0);

  // Latest mic amplitude — updated by the levels prop (1 Hz cadence
  // from expo-av), read by the 8 Hz pusher. Ref so the pusher
  // doesn't capture stale closure values.
  const latestMicRef = useRef(NOISE_FLOOR);
  useEffect(() => {
    latestMicRef.current = levels[levels.length - 1] ?? NOISE_FLOOR;
  }, [levels]);

  // 8 Hz bar pusher. Runs only while active=true. Each tick shifts
  // amps and re-animates translateX over the push interval.
  useEffect(() => {
    if (!active) return;
    const intervalId = setInterval(() => {
      setAmps((prev) => {
        const target = latestMicRef.current;
        const lastAmp = prev[prev.length - 1] ?? NOISE_FLOOR;
        const jitter = (Math.random() - 0.5) * 2 * JITTER_AMP;
        const newAmp = Math.max(
          NOISE_FLOOR,
          Math.min(1, lastAmp * (1 - AMP_LERP) + target * AMP_LERP + jitter)
        );
        const next = prev.slice(1);
        next.push(newAmp);
        return next;
      });
      cancelAnimation(translateX);
      translateX.value = 0;
      translateX.value = withTiming(-SLOT_WIDTH, {
        duration: BAR_PUSH_INTERVAL_MS,
        easing: Easing.linear,
      });
    }, BAR_PUSH_INTERVAL_MS);
    return () => clearInterval(intervalId);
  }, [active, translateX]);

  // Reset on active toggle. Fresh recording starts with a clean
  // noise-floor strip; inactive freezes the last state at half opacity.
  useEffect(() => {
    if (active) {
      setAmps(new Array(numBars).fill(NOISE_FLOOR));
      translateX.value = 0;
    } else {
      cancelAnimation(translateX);
    }
  }, [active, numBars, translateX]);

  const containerStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

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
            // Anchor so slot[numBars-1] (newest, rightmost) sits at
            // the right edge when translateX === 0. Translating to
            // -SLOT_WIDTH then pulls everything left by exactly one
            // slot per push.
            left: stripWidth - (numBars - 1) * SLOT_WIDTH - BAR_WIDTH,
            flexDirection: "row",
            alignItems: "center",
            height,
          },
          containerStyle,
        ]}
      >
        {slotConfig.map((slot) => (
          <BarView
            key={slot.idx}
            color={slot.color}
            opacity={slot.opacity}
            barHeight={Math.max(
              4,
              Math.min(1, amps[slot.idx] ?? NOISE_FLOOR) * height * 0.86
            )}
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
