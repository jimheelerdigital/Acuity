import {
  Circle,
  Defs,
  G,
  Line,
  LinearGradient as SvgLinearGradient,
  Polygon,
  Stop,
  Svg,
  Text as SvgText,
} from "react-native-svg";

import { DEFAULT_LIFE_AREAS, type LifeArea } from "@acuity/shared";

/**
 * Mobile radar chart. Pixel-port of the web `RadarChart` in
 * apps/web/src/app/insights/life-map.tsx, reimplemented with
 * react-native-svg so it renders natively without a WebView. Same
 * geometry, same colors, same polygon/stroke opacity — so dark and
 * light mode both read visually consistent with the web chart.
 *
 * Data contract (matches /api/lifemap): each area carries `score100`
 * (0..100, Slice N canonical, finer granularity) and legacy `score`
 * (1..10, build-42 backward compat). This component prefers
 * `score100` and falls back to `score * 10` if score100 is missing.
 * The polygon vertex for that axis sits at
 * `(scaled / 100) * maxRadius` from center.
 *
 * Size: the SVG is viewBox-driven, so the caller controls rendered
 * pixel size via the `size` prop (defaults to 300; Insights tab passes
 * 320 to match the screen content area on iPhone 16e).
 *
 * ─── Phase D polish (2026-05-21): label readability + degenerate-zero ─
 *
 * Labels bumped from fontSize 10 (whispered) to 12 (readable) with
 * mixed-size handling: 7-char labels (Romance/Friends/Purpose) drop
 * to fontSize 11 to keep clear of the SVG edge. Score numerals stay
 * at fontSize 9. Default text color is tokens.textSec (caller-passed)
 * for substantial-not-decoration contrast against bg.
 *
 * Geometry math at size=320 on iPhone 16e 375pt screen:
 *   - cx = cy = 160, maxR = 320 × 0.37 = 118.4pt
 *   - Label radial offset = size × 0.06 = 19.2pt beyond polygon
 *   - Label center radius from origin = 137.6pt
 *   - 10 axes at 36° spacing starting at -π/2 (12 o'clock)
 *
 * Worst-case horizontal label position is at indices 2 & 7 (±18° off
 * horizontal axis): labelP.x = 290.9 (right) / 29.1 (left).
 *
 *   6-char @ fontSize 12 (mono, ~7.2pt/char): 43.2pt wide → 21.6 half
 *     right edge: 290.9 + 21.6 = 312.5  (320 SVG → 7.5pt margin) ✓
 *
 *   7-char @ fontSize 11 (mono, ~6.6pt/char): 46.2pt wide → 23.1 half
 *     right edge: 290.9 + 23.1 = 314.0  (320 SVG → 6.0pt margin) ✓
 *
 *   7-char @ fontSize 12 would be 50.4pt → 25.2 half → 4.7pt margin
 *     (rejected — too tight under font-rendering variance)
 *
 * SVG size bump 320→340 would have given consistent fontSize 12, but
 * 340pt overflows the iPhone 16e content area (375 − 40pt padding =
 * 335pt). Per-label fontSize keeps the radar inside its container.
 *
 * Polygon vertex minimum: score=0 vertices used to coincide at the
 * centroid, producing a pinwheel of spikes from each non-zero vertex
 * back through center. MIN_VISUAL_SCORE (5 / 100) floors the polygon
 * vertex radius + node dot to ~5.9pt inner ring so the shape stays
 * continuous even when many axes are at zero. Displayed numerals
 * stay at the actual underlying score.
 */

export interface RadarArea {
  area: LifeArea | string;
  /** Legacy 1-10 score (build 42 contract). Kept for backward compat. */
  score: number;
  /** Canonical 0-100 score (Slice N). Optional during transition. */
  score100?: number;
}

/**
 * Resolves the area's display score to a 0-100 number.
 *
 * Prefers `score100` (granular). Falls back to `score * 10` so any
 * caller still on the legacy contract keeps working. Clamped 0-100
 * defensively.
 */
function resolveScore100(area: RadarArea | undefined): number | null {
  if (!area) return null;
  const raw =
    typeof area.score100 === "number" ? area.score100 : area.score * 10;
  return Math.max(0, Math.min(100, Math.round(raw)));
}

/**
 * Minimum polygon vertex radius (as a fraction of maxR). At maxR≈118pt
 * this yields ~5.9pt inner radius — small enough to stay inside the
 * innermost grid ring (~23.7pt at 20%) but large enough that the
 * polygon's continuous shape is visible even when many axes are at 0.
 * Used by both the polygon and node-dot radii so they coincide.
 */
const MIN_VISUAL_SCORE = 5;

function polygonVertexRadius(score100: number | null, maxR: number): number {
  const floored = Math.max(score100 ?? 0, MIN_VISUAL_SCORE);
  return (floored / 100) * maxR;
}

interface PolishProps {
  /**
   * Q7 polish: when set, the data polygon's fill + stroke use a
   * palette gradient (primary → secondary) instead of the legacy
   * hardcoded violet. Pass the two endpoint hex colors; an SVG
   * LinearGradient is built inline.
   */
  gradientColors?: [string, string];
  /** Font family for axis name labels. Defaults to system. */
  labelFontFamily?: string;
  /** Font family for the per-axis score numbers. Defaults to system. */
  scoreFontFamily?: string;
  /** Outer ring color on vertex dots. Defaults to "white". */
  nodeStrokeColor?: string;
}

interface Props extends PolishProps {
  areas: RadarArea[];
  size?: number;
  /** Axis labels + score text tint. Pass dark/light per theme. */
  labelColor?: string;
  scoreColor?: string;
  /** Grid ring + spoke stroke. */
  gridColor?: string;
  /** Center "You" dot + label. */
  centerLabelColor?: string;
  /** Tap handler — receives the enum key (e.g. "CAREER") of the
   *  tapped axis. Omit to make the radar display-only. */
  onAreaPress?: (areaKey: string) => void;
  /** Enum key of the currently selected axis; receives a larger
   *  node + pulse ring. Drives visual parity with the detail card. */
  selectedAreaKey?: string | null;
  /** Optional ~4-weeks-ago snapshot. When provided, renders a dashed
   *  grey overlay polygon behind the current polygon. Null per-area
   *  values fall back to the current score (zero-delta for that axis). */
  trendAreas?: Array<{ area: string; score: number | null }>;
}

export function LifeMapRadar({
  areas,
  size = 300,
  labelColor = "#71717A",
  scoreColor = "#A1A1AA",
  gridColor = "#E4E4E7",
  centerLabelColor = "#18181B",
  onAreaPress,
  selectedAreaKey,
  trendAreas,
  gradientColors,
  labelFontFamily,
  scoreFontFamily,
  nodeStrokeColor = "white",
}: Props) {
  const cx = size / 2;
  const cy = size / 2;
  // Leave enough margin for axis labels + score text below each node.
  const maxR = size * 0.37;
  const levels = 5;

  const areaConfigs = DEFAULT_LIFE_AREAS;
  const angleStep = (2 * Math.PI) / areaConfigs.length;
  const startAngle = -Math.PI / 2;

  const getPoint = (index: number, radius: number) => {
    const angle = startAngle + index * angleStep;
    return {
      x: cx + radius * Math.cos(angle),
      y: cy + radius * Math.sin(angle),
    };
  };

  // Data polygon. Score lookup keys on .area so the API response
  // (uppercase enum value like "CAREER") matches DEFAULT_LIFE_AREAS.enum.
  // Vertex radius is floored at MIN_VISUAL_SCORE so a zero-axis user
  // sees a continuous inner-ring shape, not center-collapsed spikes.
  const polyPoints = areaConfigs
    .map((config, i) => {
      const area = areas.find(
        (a) => a.area === config.enum || a.area === config.name
      );
      const score100 = resolveScore100(area);
      const p = getPoint(i, polygonVertexRadius(score100, maxR));
      return `${p.x},${p.y}`;
    })
    .join(" ");

  // Trend overlay — per-axis ~4-weeks-ago score. Null = no data for
  // that axis, collapse to the current score so the polygon remains
  // closed (no weird zero-collapse toward center).
  //
  // Trend data still uses the legacy 1-10 `score` shape (history
  // table predates Slice N). Convert to 0-100 via *10 for the
  // polygon math. Same minimum-visual floor as the current polygon.
  const trendPolyPoints = trendAreas
    ? areaConfigs
        .map((config, i) => {
          const t = trendAreas.find((ta) => ta.area === config.enum);
          const current = areas.find(
            (a) => a.area === config.enum || a.area === config.name
          );
          const score100 =
            t?.score != null
              ? Math.max(0, Math.min(100, t.score * 10))
              : current
                ? (resolveScore100(current) ?? 0)
                : 0;
          const p = getPoint(i, polygonVertexRadius(score100, maxR));
          return `${p.x},${p.y}`;
        })
        .join(" ")
    : null;

  // Q7 polish — palette gradient on the data polygon when caller
  // supplies endpoint colors. Stable id (one radar per Insights tab
  // in practice; if multiple render, callers can wrap to scope).
  const polyFill = gradientColors ? "url(#lifemap-poly-fill)" : "#7C3AED";
  const polyStroke = gradientColors ? "url(#lifemap-poly-stroke)" : "#7C3AED";

  return (
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {gradientColors && (
        <Defs>
          <SvgLinearGradient
            id="lifemap-poly-fill"
            x1="0"
            y1="0"
            x2={size}
            y2={size}
            gradientUnits="userSpaceOnUse"
          >
            <Stop
              offset="0"
              stopColor={gradientColors[0]}
              stopOpacity="0.22"
            />
            <Stop
              offset="1"
              stopColor={gradientColors[1]}
              stopOpacity="0.22"
            />
          </SvgLinearGradient>
          <SvgLinearGradient
            id="lifemap-poly-stroke"
            x1="0"
            y1="0"
            x2={size}
            y2={size}
            gradientUnits="userSpaceOnUse"
          >
            <Stop offset="0" stopColor={gradientColors[0]} stopOpacity="1" />
            <Stop offset="1" stopColor={gradientColors[1]} stopOpacity="1" />
          </SvgLinearGradient>
        </Defs>
      )}
      {/* Grid rings — five concentric hexagons at 20/40/60/80/100% */}
      {Array.from({ length: levels }).map((_, i) => {
        const r = ((i + 1) / levels) * maxR;
        const points = areaConfigs
          .map((_, j) => {
            const p = getPoint(j, r);
            return `${p.x},${p.y}`;
          })
          .join(" ");
        return (
          <Polygon
            key={`ring-${i}`}
            points={points}
            fill="none"
            stroke={gridColor}
            strokeWidth={0.5}
          />
        );
      })}

      {/* Spokes — center to each axis vertex */}
      {areaConfigs.map((_, i) => {
        const p = getPoint(i, maxR);
        return (
          <Line
            key={`spoke-${i}`}
            x1={cx}
            y1={cy}
            x2={p.x}
            y2={p.y}
            stroke={gridColor}
            strokeWidth={0.5}
          />
        );
      })}

      {/* Trend overlay polygon — drawn BEHIND the current polygon.
          Dashed grey stroke = "4 weeks ago shape". */}
      {trendPolyPoints && (
        <Polygon
          points={trendPolyPoints}
          fill="none"
          stroke="#A1A1AA"
          strokeWidth={1}
          strokeDasharray="4,3"
          strokeOpacity={0.7}
        />
      )}

      {/* Data polygon — palette gradient when caller passes
          gradientColors (Q7 polish); falls back to the legacy
          violet for any consumer still on the old props. */}
      <Polygon
        points={polyPoints}
        fill={polyFill}
        fillOpacity={gradientColors ? 1 : 0.12}
        stroke={polyStroke}
        strokeWidth={1.5}
      />

      {/* Area nodes + axis labels. Each axis is tappable via its own
          G wrapper so the touch target covers the node + label + score
          text in one hit — fingers don't hit a 4px SVG circle.
          Node radius shares the polygon's MIN_VISUAL_SCORE floor so
          the dot sits at the same place as the polygon vertex even
          when the underlying score is 0. */}
      {areaConfigs.map((config, i) => {
        const area = areas.find(
          (a) => a.area === config.enum || a.area === config.name
        );
        const score100 = resolveScore100(area);
        const nodeP = getPoint(i, polygonVertexRadius(score100, maxR));
        const labelP = getPoint(i, maxR + size * 0.06);
        const isSelected =
          selectedAreaKey !== null &&
          selectedAreaKey !== undefined &&
          (selectedAreaKey === config.enum || selectedAreaKey === config.name);
        const handlePress = onAreaPress
          ? () => onAreaPress(config.enum)
          : undefined;
        // shortName is the radar-label form (≤7 chars, Phase D); name
        // remains the full display label for cards and detail screens.
        const labelText =
          (config as { shortName?: string }).shortName ?? config.name;
        // Per-label fontSize: 7-char labels drop to 11 to keep clear
        // of the SVG edge at size=320 (see docblock geometry math).
        const labelFontSize = labelText.length >= 7 ? 11 : 12;

        return (
          <G key={`node-${config.enum}`} onPress={handlePress}>
            {isSelected && (
              <Circle
                cx={nodeP.x}
                cy={nodeP.y}
                r={10}
                fill={config.color}
                fillOpacity={0.25}
              />
            )}
            <Circle
              cx={nodeP.x}
              cy={nodeP.y}
              r={isSelected ? 6 : 4.5}
              fill={config.color}
              stroke={nodeStrokeColor}
              strokeWidth={2}
            />
            <SvgText
              x={labelP.x}
              y={labelP.y}
              textAnchor="middle"
              fontSize={labelFontSize}
              fontWeight={isSelected ? "700" : "600"}
              fill={isSelected ? config.color : labelColor}
              fontFamily={labelFontFamily}
            >
              {labelText}
            </SvgText>
            <SvgText
              x={labelP.x}
              y={labelP.y + labelFontSize + 2}
              textAnchor="middle"
              fontSize={9}
              fill={scoreColor}
              fontFamily={scoreFontFamily}
            >
              {resolveScore100(area)?.toString() ?? "—"}
            </SvgText>
          </G>
        );
      })}

      {/* Center dot + "You" label */}
      <Circle cx={cx} cy={cy} r={3} fill={centerLabelColor} />
      <SvgText
        x={cx}
        y={cy + 12}
        textAnchor="middle"
        fontSize={8}
        fill={scoreColor}
      >
        You
      </SvgText>
    </Svg>
  );
}
