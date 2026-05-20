import { LinearGradient } from "expo-linear-gradient";
import { View } from "react-native";

import { useTheme } from "@/contexts/theme-context";

/**
 * RecordWaveform — horizontal level-bar strip during recording.
 *
 * Fed by the same `levels` array the parent already drives via expo-
 * av's `setOnRecordingStatusUpdate` callback (1 Hz cadence, -60..0 dB
 * mapped to 0..1). Each level value renders one vertical bar; height
 * scales with the value. Bell-curve weighting (taller in the middle,
 * shorter at the edges) is applied at render time per the design —
 * the existing level data is volume-only, no spatial information, so
 * the bell shape is purely cosmetic.
 *
 * Color: a single full-strip LinearGradient backs the bars (primary
 * → secondary), with each bar a "mask" View on top. Cheaper than 18
 * nested LinearGradients per render, and indistinguishable on-device.
 *
 * Idle/active: when `active` is false, bars hold their last known
 * heights at low opacity. This keeps the strip from collapsing
 * abruptly when the user stops recording (and avoids the post-stop
 * flash where the strip would otherwise render as a flat line for
 * one paint before the screen transitions to uploading).
 */

const BAR_GAP = 3;

export interface RecordWaveformProps {
  /** Rolling-window amplitude values 0..1. Length determines bar count. */
  levels: number[];
  /** Render dim when not actively recording. */
  active: boolean;
  /** Strip height in pt. Default 80 per design. */
  height?: number;
  /** Override bar width — default scales bar to fill available width. */
  barWidth?: number;
}

export function RecordWaveform({
  levels,
  active,
  height = 80,
  barWidth = 3,
}: RecordWaveformProps) {
  const { tokens } = useTheme();
  const count = levels.length;
  if (count === 0) {
    return <View style={{ height }} />;
  }

  // Bell-curve weighting per design — taller in the center, shorter
  // at the edges. Applied as a per-bar height multiplier in [0.4, 1].
  const center = (count - 1) / 2;
  const bell = (i: number) => {
    const dist = Math.abs(i - center) / Math.max(1, center);
    return Math.max(0.4, 1 - dist * 0.6);
  };

  return (
    <View
      style={{
        height,
        width: "100%",
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: BAR_GAP,
        opacity: active ? 1 : 0.5,
      }}
    >
      {levels.map((lvl, i) => {
        const clamped = Math.max(0.05, Math.min(1, lvl));
        const h = Math.max(6, height * 0.92 * clamped * bell(i));
        return (
          <View
            key={i}
            style={{
              width: barWidth,
              height: h,
              borderRadius: barWidth / 2,
              overflow: "hidden",
            }}
          >
            <LinearGradient
              colors={[tokens.primaryHi, tokens.secondary]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={{ flex: 1 }}
            />
          </View>
        );
      })}
    </View>
  );
}
