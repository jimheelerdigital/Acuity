import { useMemo } from "react";
import { useWindowDimensions, View } from "react-native";
import Svg, {
  Defs,
  LinearGradient as SvgLinearGradient,
  Path,
  Stop,
} from "react-native-svg";

import { useTheme } from "@/contexts/theme-context";

/**
 * RecordWaveform — continuous flowing waveform.
 *
 * Q5 polish pass: replaced the prior bar-strip with a single smoothed
 * SVG path. Same input signal (the existing `levels[]` populated by
 * expo-av's metering callback) — no new audio listeners. The smooth
 * shape comes from Catmull-Rom → cubic Bezier interpolation through
 * the sample points; the "scroll" feel comes from the natural rolling
 * window in the parent state (each new sample shifts the array left,
 * which shifts the path left on re-render).
 *
 * Path geometry:
 *   - For each sample i, compute (x_i, y_top_i) and (x_i, y_bot_i)
 *     where the line oscillates above and below a horizontal baseline.
 *     amplitude × bell(i) gives the half-height; bell weighting tapers
 *     toward the edges so the wave fades at the strip's left/right.
 *   - The path traces the top edge L→R, then the bottom edge R→L,
 *     making a closed shape. Stroked with the palette gradient — no
 *     fill — so the eye reads a single line with thickness rather
 *     than a filled blob.
 *   - Catmull-Rom → Bezier conversion (tension 1/6) smooths every
 *     segment without forcing extra control logic on the caller.
 *
 * Idle state: when `active` is false, the strip dims to 0.5 opacity
 * so it doesn't collapse abruptly when recording stops. (Same idle
 * handling as the first cut.)
 */

const STROKE_WIDTH = 2.5;

export interface RecordWaveformProps {
  /** Rolling-window amplitude values 0..1. Length determines sample resolution. */
  levels: number[];
  /** Render dim when not actively recording. */
  active: boolean;
  /** Strip height in pt. Default 80 per design. */
  height?: number;
}

/**
 * Generate a smoothed path that passes through every point in `pts`.
 * Catmull-Rom to cubic-Bezier conversion: for each segment p1→p2,
 * control points are derived from p0 and p3 (the neighbors on each
 * side). Tension 1/6 is the canonical "uniform" Catmull-Rom value
 * — produces curves that pass through the points without overshoot.
 */
function smoothPath(pts: { x: number; y: number }[]): string {
  if (pts.length === 0) return "";
  if (pts.length === 1) {
    return `M ${pts[0].x} ${pts[0].y}`;
  }
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i += 1) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
  }
  return d;
}

export function RecordWaveform({
  levels,
  active,
  height = 80,
}: RecordWaveformProps) {
  const { tokens } = useTheme();
  const { width: screenWidth } = useWindowDimensions();
  // Visible width — full screen minus parent's horizontal padding
  // (record.tsx applies px-8 = 32px each side).
  const stripWidth = Math.max(0, screenWidth - 64);

  const paths = useMemo(() => {
    const count = levels.length;
    if (count < 2 || stripWidth <= 0) {
      return { top: "", bottom: "" };
    }
    const center = height / 2;
    const maxAmp = height * 0.42; // leaves ~8% margin top/bottom

    // Bell weighting taper — edges quieter so the wave fades into the
    // strip ends rather than getting clipped against them.
    const mid = (count - 1) / 2;
    const bell = (i: number) => {
      const dist = Math.abs(i - mid) / Math.max(1, mid);
      return Math.max(0.35, 1 - dist * 0.65);
    };

    // Compute mirrored top/bottom point arrays.
    const top: { x: number; y: number }[] = [];
    const bottom: { x: number; y: number }[] = [];
    for (let i = 0; i < count; i += 1) {
      const lvl = Math.max(0.04, Math.min(1, levels[i] ?? 0));
      const x = (stripWidth * i) / (count - 1);
      const halfAmp = lvl * maxAmp * bell(i);
      top.push({ x, y: center - halfAmp });
      bottom.push({ x, y: center + halfAmp });
    }
    return {
      top: smoothPath(top),
      bottom: smoothPath(bottom),
    };
  }, [levels, stripWidth, height]);

  if (stripWidth <= 0) return <View style={{ height }} />;

  return (
    <View
      style={{
        height,
        width: stripWidth,
        opacity: active ? 1 : 0.5,
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
            <Stop offset="0%" stopColor={tokens.primary} stopOpacity={0.4} />
            <Stop offset="50%" stopColor={tokens.primary} stopOpacity={1} />
            <Stop offset="100%" stopColor={tokens.secondary} stopOpacity={0.4} />
          </SvgLinearGradient>
        </Defs>
        {paths.top && (
          <Path
            d={paths.top}
            stroke="url(#waveform-grad)"
            strokeWidth={STROKE_WIDTH}
            strokeLinecap="round"
            fill="none"
          />
        )}
        {paths.bottom && (
          <Path
            d={paths.bottom}
            stroke="url(#waveform-grad)"
            strokeWidth={STROKE_WIDTH}
            strokeLinecap="round"
            fill="none"
          />
        )}
      </Svg>
    </View>
  );
}
