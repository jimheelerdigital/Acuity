import { View } from "react-native";
import Svg, {
  Circle,
  Defs,
  G,
  LinearGradient as SvgLinearGradient,
  Polygon,
  Stop,
} from "react-native-svg";

import { useTheme } from "@/contexts/theme-context";

/**
 * MiniRadar — small 12-axis radar polygon for onboarding previews.
 *
 * Used in onboarding step 3 (Life Matrix scoring) to show the user
 * which axes they've scored so far and where they sit on each. The
 * `highlightAxis` index (0-11) gets a pulsing glow ring around its
 * vertex dot — signals "this is the axis you're scoring now".
 *
 * Axes order per design spec (12, in this exact order):
 * Career, Health, Family, Friends, Romance, Money, Growth,
 * Creativity, Body, Mind, Joy, Purpose.
 *
 * 12 spokes evenly distributed (30° apart). Polygon vertex sits
 * at `(score/100) × maxRadius` along each spoke; missing scores
 * (null/undefined in `scores`) collapse to 0 to keep the polygon
 * closed.
 */

export interface MiniRadarProps {
  /** 12 values 0-100. `null` for un-scored axes (renders at 0). */
  scores: (number | null)[];
  /** 0-11 index of the axis currently being scored. */
  highlightAxis?: number;
  /** SVG diameter. Default 130 matches onboarding preview. */
  size?: number;
}

const AXIS_COUNT = 12;

export function MiniRadar({
  scores,
  highlightAxis,
  size = 130,
}: MiniRadarProps) {
  const { tokens, resolved } = useTheme();
  const padding = 12;
  const cx = size / 2;
  const cy = size / 2;
  const maxR = (size - padding * 2) / 2;

  const isDark = resolved === "dark";
  const grid = isDark ? "#ffffff14" : "#00000010";
  const gridStrong = isDark ? "#ffffff21" : "#0000001a";

  // Convert axis index to angle in radians. 0 = top (-90° in math
  // convention); rotates clockwise so axis 1 sits at +30° from there.
  const angle = (i: number) => -Math.PI / 2 + (i * 2 * Math.PI) / AXIS_COUNT;

  // Build polygon points string from scores.
  const points = Array.from({ length: AXIS_COUNT }, (_, i) => {
    const v = scores[i] ?? 0;
    const r = (Math.max(0, Math.min(100, v)) / 100) * maxR;
    const a = angle(i);
    return `${cx + Math.cos(a) * r},${cy + Math.sin(a) * r}`;
  }).join(" ");

  // Concentric grid polygons (4 rings at 25/50/75/100% of maxR).
  const gridRings = [0.25, 0.5, 0.75, 1].map((scale) =>
    Array.from({ length: AXIS_COUNT }, (_, i) => {
      const r = scale * maxR;
      const a = angle(i);
      return `${cx + Math.cos(a) * r},${cy + Math.sin(a) * r}`;
    }).join(" ")
  );

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size}>
        <Defs>
          <SvgLinearGradient id="miniRadarFill" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0%" stopColor={tokens.primary} stopOpacity={0.35} />
            <Stop offset="100%" stopColor={tokens.secondary} stopOpacity={0.35} />
          </SvgLinearGradient>
          <SvgLinearGradient id="miniRadarStroke" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0%" stopColor={tokens.primary} />
            <Stop offset="100%" stopColor={tokens.secondary} />
          </SvgLinearGradient>
        </Defs>

        {/* Concentric grid rings */}
        {gridRings.map((pts, idx) => (
          <Polygon
            key={idx}
            points={pts}
            fill="none"
            stroke={idx === gridRings.length - 1 ? gridStrong : grid}
            strokeWidth={0.5}
          />
        ))}

        {/* Axis spokes — short lines from center to outermost ring. */}
        <G>
          {Array.from({ length: AXIS_COUNT }, (_, i) => {
            const a = angle(i);
            return (
              <Polygon
                key={`spoke-${i}`}
                points={`${cx},${cy} ${cx + Math.cos(a) * maxR},${cy + Math.sin(a) * maxR}`}
                stroke={grid}
                strokeWidth={0.5}
              />
            );
          })}
        </G>

        {/* Score polygon */}
        <Polygon
          points={points}
          fill="url(#miniRadarFill)"
          stroke="url(#miniRadarStroke)"
          strokeWidth={1.5}
          strokeLinejoin="round"
        />

        {/* Vertex dots — one per axis with score > 0 */}
        {scores.map((v, i) => {
          if (v == null) return null;
          const clamped = Math.max(0, Math.min(100, v));
          const r = (clamped / 100) * maxR;
          const a = angle(i);
          const x = cx + Math.cos(a) * r;
          const y = cy + Math.sin(a) * r;
          const isHighlight = i === highlightAxis;
          return (
            <G key={`dot-${i}`}>
              {/* Pulsing glow ring on the active axis. Pulse animation
                  is a future Reanimated enhancement (consumer wraps in
                  an Animated.View with repeating withTiming on opacity);
                  static for the primitive baseline. */}
              {isHighlight && (
                <Circle
                  cx={x}
                  cy={y}
                  r={6}
                  fill="none"
                  stroke={tokens.primary}
                  strokeWidth={1.5}
                  opacity={0.6}
                />
              )}
              <Circle
                cx={x}
                cy={y}
                r={isHighlight ? 3 : 2}
                fill={isHighlight ? tokens.primary : tokens.text}
              />
            </G>
          );
        })}
      </Svg>
    </View>
  );
}
