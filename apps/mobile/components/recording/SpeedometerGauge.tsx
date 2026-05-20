import type { ReactNode } from "react";
import { Text, View } from "react-native";
import Svg, {
  Circle,
  Defs,
  G,
  Line,
  LinearGradient as SvgLinearGradient,
  Path,
  Stop,
  Text as SvgText,
} from "react-native-svg";

import { useTheme } from "@/contexts/theme-context";

/**
 * SpeedometerGauge — top half-circle arc that cups the record orb.
 *
 * Geometry (from screen-recording.jsx):
 *   - Top arc: θ ∈ [0, π] where θ=0 is the left endpoint, θ=π is the
 *     right endpoint. Point on arc: (cx - r·cos θ, cy - r·sin θ).
 *   - Progress sweeps left → right as elapsed/maxSeconds grows.
 *   - 19 tick marks radiate outward; every 3rd is bolder + longer.
 *
 * The orb + timer render inside the arc cup via the `children` slot
 * — keeps the visual relationship right (the gauge "holds" the orb)
 * without forcing the parent to manage absolute positioning.
 *
 * Color: gradient stroke from tokens.primary → tokens.secondary,
 * with a soft duplicate blur layer underneath for the glow read on
 * dark mode. Crisp stroke on top for definition.
 */

export interface SpeedometerGaugeProps {
  /** Elapsed seconds. Clamps to [0, maxSeconds]. */
  elapsed: number;
  /** Maximum recording duration. Default 90s per design canvas. */
  maxSeconds?: number;
  /** Width of the gauge SVG in pt. Default matches the design canvas. */
  size?: number;
  /** Content rendered inside the arc cup — orb + timer. */
  children?: ReactNode;
  /** Optional label overrides for the left/right tick endpoints. */
  leftLabel?: string;
  rightLabel?: string;
}

function formatMSS(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function SpeedometerGauge({
  elapsed,
  maxSeconds = 90,
  size = 312,
  children,
  leftLabel,
  rightLabel,
}: SpeedometerGaugeProps) {
  const { tokens, resolved } = useTheme();
  const isDark = resolved === "dark";

  const clamped = Math.max(0, Math.min(maxSeconds, elapsed));
  const pct = maxSeconds === 0 ? 0 : clamped / maxSeconds;

  // SVG arc geometry. cy is the bottom of the arc; the top of the
  // canvas needs to be ABOVE cy by arcRadius (the apex). Endpoint
  // labels sit at cy + 22 — add 12 more for the label-row height
  // so the SVG never clips the descenders.
  const cx = size / 2;
  const cy = Math.round(size * 0.42);
  const arcRadius = Math.round(size * 0.345);
  const svgHeight = cy + 34;

  // Parameterized point along the top arc.
  const ptOnArc = (theta: number) => [
    cx - Math.cos(theta) * arcRadius,
    cy - Math.sin(theta) * arcRadius,
  ];
  const [x1, y1] = ptOnArc(0);
  const [x2, y2] = ptOnArc(Math.PI * pct);
  const [xEnd, yEnd] = ptOnArc(Math.PI);

  const trackColor = isDark ? "#ffffff14" : "#00000012";
  const tickInactive = isDark ? "#ffffff29" : "#00000029";

  // Q5 polish — children render in natural flow under the SVG. The
  // negative top margin pulls the orb up into the arc cup so the
  // visual relationship stays (orb cradled by the gauge), while the
  // outer View height still grows to include the children — meaning
  // the next sibling (waveform) gets pushed down correctly.
  const cupOverlap = Math.round(arcRadius * 0.38);

  return (
    <View style={{ width: size, alignSelf: "center" }}>
      <Svg width={size} height={svgHeight}>
        <Defs>
          <SvgLinearGradient id="gauge-grad" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0%" stopColor={tokens.primary} />
            <Stop offset="100%" stopColor={tokens.secondary} />
          </SvgLinearGradient>
        </Defs>

        {/* Track — full top half-circle hairline. */}
        <Path
          d={`M ${x1} ${y1} A ${arcRadius} ${arcRadius} 0 0 1 ${xEnd} ${yEnd}`}
          stroke={trackColor}
          strokeWidth={10}
          fill="none"
          strokeLinecap="round"
        />

        {/* Tick marks — 19 radiating lines, every 3rd longer + bolder. */}
        <G>
          {Array.from({ length: 19 }).map((_, i) => {
            const theta = (Math.PI * i) / 18;
            const tickInner = arcRadius + 12;
            const tickOuter = arcRadius + (i % 3 === 0 ? 22 : 18);
            const ti = i / 18;
            const isActive = ti <= pct;
            const c = Math.cos(theta);
            const s = Math.sin(theta);
            return (
              <Line
                key={i}
                x1={cx - c * tickInner}
                y1={cy - s * tickInner}
                x2={cx - c * tickOuter}
                y2={cy - s * tickOuter}
                stroke={isActive ? tokens.primary : tickInactive}
                strokeWidth={i % 3 === 0 ? 1.8 : 1}
                strokeLinecap="round"
                opacity={isActive ? 1 : 0.7}
              />
            );
          })}
        </G>

        {/* Progress arc — gradient stroke with rounded cap. */}
        {pct > 0 && (
          <Path
            d={`M ${x1} ${y1} A ${arcRadius} ${arcRadius} 0 0 1 ${x2} ${y2}`}
            stroke="url(#gauge-grad)"
            strokeWidth={10}
            fill="none"
            strokeLinecap="round"
          />
        )}

        {/* Progress head — white circle ringed in gradient. */}
        {pct > 0 && (
          <Circle
            cx={x2}
            cy={y2}
            r={9}
            fill="#ffffff"
            stroke="url(#gauge-grad)"
            strokeWidth={3}
          />
        )}

        {/* Endpoint labels — mono numerals under each end of the arc. */}
        <SvgText
          x={x1}
          y={y1 + 22}
          fill={tokens.textTer}
          fontSize={10}
          fontWeight="600"
          fontFamily={tokens.fontMono}
          letterSpacing={0.6}
          textAnchor="middle"
        >
          {leftLabel ?? "0:00"}
        </SvgText>
        <SvgText
          x={xEnd}
          y={yEnd + 22}
          fill={tokens.textTer}
          fontSize={10}
          fontWeight="600"
          fontFamily={tokens.fontMono}
          letterSpacing={0.6}
          textAnchor="middle"
        >
          {rightLabel ?? formatMSS(maxSeconds)}
        </SvgText>
      </Svg>

      {/* Children flow naturally below the SVG. Negative margin pulls
          the cluster up into the arc cup; container height still
          grows to include them so siblings (waveform) get pushed
          down correctly — fixes the Q5-first-cut overlap bug. */}
      <View
        style={{
          alignItems: "center",
          marginTop: -cupOverlap,
        }}
      >
        {children}
      </View>
    </View>
  );
}
