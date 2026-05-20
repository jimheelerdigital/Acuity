import { useEffect } from "react";
import type { ComponentType } from "react";
import { useWindowDimensions, View } from "react-native";
import Animated, {
  useAnimatedProps,
  useFrameCallback,
  useSharedValue,
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
 * RecordWaveform — Apple Voice Memos style scrolling bar histogram.
 *
 * Q5 polish 9 (2026-05-20): the polish-6 cut shifted a React-state
 * amps array at 8 Hz alongside a Reanimated translateX reset; the
 * setState/transform race produced a visible 1-2 frame jolt on every
 * push. Rewrote so everything runs on the UI thread:
 *
 *   - One `useFrameCallback` worklet advances `elapsed` each frame,
 *     pushes a new amp into `ampsShared` when elapsed crosses the
 *     BAR_PUSH_INTERVAL, and accumulates the residual sub-interval
 *     time for the next frame's scroll.
 *   - One `useAnimatedProps` worklet builds the SVG path string each
 *     frame from `ampsShared` + `elapsed`. Each "bar" is a vertical
 *     line segment rendered with `strokeLinecap="round"` and
 *     `strokeWidth={BAR_WIDTH}` — gives the rounded-rectangle bar
 *     look without rendering N separate <Rect>s.
 *
 * No React state changes on push. No setState/animation race. No
 * <View>-per-bar reconciliation. A single AnimatedPath updates on
 * each UI frame; the path string is ~80 visible bars × 25 chars =
 * ~2KB of string concat per frame, well within worklet budget on
 * iPhone 16e.
 *
 * Scroll model: bar i in the array sits at screen-x = stripWidth -
 * i*SLOT_WIDTH - scrollPx, where scrollPx = (elapsed /
 * BAR_PUSH_INTERVAL_MS) * SLOT_WIDTH. So bars move from right to
 * left at exactly SLOT_WIDTH per push interval. At the moment of a
 * push, scrollPx resets to 0 and a new amp gets inserted at index 0
 * — visually seamless because the old amp at index 0 is now at
 * index 1 (i.e. one slot to the left), matching the position it
 * just animated to.
 *
 * Color: a single LinearGradient stroke in user-space coords. Fades
 * from alpha 0 at the left edge to full primary at 15% → secondary
 * at the right — bars dissolve as they scroll off-screen.
 *
 * Audio capture, /api/record path, levels[] producer all untouched.
 */

const BAR_WIDTH = 2.5;
const BAR_GAP = 2;
const SLOT_WIDTH = BAR_WIDTH + BAR_GAP;
const BAR_PUSH_INTERVAL_MS = 125;
const NOISE_FLOOR = 0.12;
const AMP_LERP = 0.55;
const JITTER_AMP = 0.04;
// Ring-buffer cap. visibleSlots is ~73 on iPhone 16e; cap at 200
// gives plenty of headroom while keeping memory trivial (~1.5KB).
const MAX_BARS = 200;

// Reanimated v4's animatedProps surface on PathProps doesn't include
// `d` as animatable — same workaround we use elsewhere.
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
  const stripWidth = Math.max(0, screenWidth - 64);
  const cy = height / 2;
  const maxBarH = height * 0.86;
  // +2 so two extra slots wait off the right edge to scroll in
  // cleanly without a one-frame "gap" at the right boundary.
  const visibleSlots = Math.max(8, Math.ceil(stripWidth / SLOT_WIDTH) + 2);

  // All state lives on the UI thread.
  const activeShared = useSharedValue(active);
  const latestMicShared = useSharedValue(NOISE_FLOOR);
  const ampsShared = useSharedValue<number[]>(
    new Array(visibleSlots).fill(NOISE_FLOOR)
  );
  const elapsed = useSharedValue(0);

  // Sync React props → shared values. These are the only JS-thread
  // touches per push interval; setting a shared value is cheap and
  // doesn't trigger a React re-render.
  useEffect(() => {
    activeShared.value = active;
    if (active) {
      elapsed.value = 0;
      ampsShared.value = new Array(visibleSlots).fill(NOISE_FLOOR);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, visibleSlots]);

  useEffect(() => {
    latestMicShared.value = levels[levels.length - 1] ?? NOISE_FLOOR;
  }, [levels, latestMicShared]);

  // UI-thread frame driver. Advances elapsed; pushes new amps onto
  // the ring buffer when elapsed crosses BAR_PUSH_INTERVAL. The
  // while-loop handles dropped frames cleanly (multiple pushes per
  // frame if the device skipped).
  useFrameCallback((info) => {
    if (!activeShared.value) return;
    const dt = info.timeSincePreviousFrame ?? 16;
    elapsed.value += dt;

    while (elapsed.value >= BAR_PUSH_INTERVAL_MS) {
      elapsed.value -= BAR_PUSH_INTERVAL_MS;
      const prev = ampsShared.value;
      const lastAmp = prev[0] ?? NOISE_FLOOR;
      const target = latestMicShared.value;
      const jitter = (Math.random() - 0.5) * 2 * JITTER_AMP;
      const newAmp = Math.max(
        NOISE_FLOOR,
        Math.min(1, lastAmp * (1 - AMP_LERP) + target * AMP_LERP + jitter)
      );
      // Newest at index 0; older bars shift right (higher indices).
      // Trim to MAX_BARS so memory stays bounded over a 5-minute take.
      const next = [newAmp, ...prev];
      ampsShared.value =
        next.length > MAX_BARS ? next.slice(0, MAX_BARS) : next;
    }
  });

  // Path string builder. Runs every UI frame because elapsed updates
  // every frame via useFrameCallback. Walks the amps array from
  // newest (index 0, right edge) to oldest (off the left edge); each
  // bar is one "M x y_top L x y_bot" pair in the SVG path data.
  const animatedProps = useAnimatedProps(() => {
    const amps = ampsShared.value;
    const e = elapsed.value;
    const scrollPx = (e / BAR_PUSH_INTERVAL_MS) * SLOT_WIDTH;

    let d = "";
    for (let i = 0; i < amps.length; i += 1) {
      const x = stripWidth - i * SLOT_WIDTH - scrollPx;
      if (x < -SLOT_WIDTH) break;
      if (x > stripWidth + SLOT_WIDTH) continue;
      const amp = amps[i];
      const barH = Math.max(4, amp * maxBarH);
      const yTop = cy - barH / 2;
      const yBot = cy + barH / 2;
      d +=
        "M " +
        x.toFixed(1) +
        " " +
        yTop.toFixed(1) +
        " L " +
        x.toFixed(1) +
        " " +
        yBot.toFixed(1) +
        " ";
    }
    return { d };
  });

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
      <Svg width={stripWidth} height={height}>
        <Defs>
          {/* User-space gradient so the left fade stays at the left
              edge of the strip regardless of where bars happen to
              be at any frame. */}
          <SvgLinearGradient
            id="wf-grad"
            x1="0"
            y1="0"
            x2={stripWidth}
            y2="0"
            gradientUnits="userSpaceOnUse"
          >
            <Stop offset="0" stopColor={tokens.primary} stopOpacity="0" />
            <Stop
              offset="0.15"
              stopColor={tokens.primary}
              stopOpacity="1"
            />
            <Stop
              offset="0.55"
              stopColor={tokens.primary}
              stopOpacity="1"
            />
            <Stop offset="1" stopColor={tokens.secondary} stopOpacity="1" />
          </SvgLinearGradient>
        </Defs>
        <AnimatedPath
          animatedProps={animatedProps}
          stroke="url(#wf-grad)"
          strokeWidth={BAR_WIDTH}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </Svg>
    </View>
  );
}
