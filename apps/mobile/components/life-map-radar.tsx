import { Text, View } from "react-native";
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
 * Empty-axis honesty (Phase D polish 2, 2026-05-21): axes with score=0
 * or no measurement are NOT drawn as polygon vertices and NOT given
 * colored dots. The previous MIN_VISUAL_SCORE inner-ring floor was
 * abandoned — it fabricated shape information we don't have, and
 * produced a cluttered "clot" of dots near center. The new treatment:
 *
 *   - Populated axes (score > 0): rendered into the polygon path,
 *     filled palette dot at vertex, label in labelColor, numeric value.
 *   - Empty axes (score = 0 or missing): NOT in polygon path, hollow
 *     ring at the outer-100% radius, muted label (mutedLabelColor at
 *     ~0.5 opacity), "—" instead of "0" as the value.
 *   - All-empty state: polygon doesn't render at all; a helper hint
 *     ("Record an entry…") renders below the SVG if emptyHint prop set.
 *
 * The polygon now closes only across populated axes. Smaller and more
 * irregular for new users, but it tells the truth.
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
 * An axis is "populated" when its score has a positive measurement.
 * Score 0 or null both mean "no signal" — extraction either hasn't
 * fired yet or detected no mention. Either way, we don't draw shape
 * for it. See empty-axis treatment in the component docblock.
 */
function isPopulated(score100: number | null): boolean {
  return score100 !== null && score100 > 0;
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
  /** Populated-axis label + score text tint. Pass dark/light per theme. */
  labelColor?: string;
  scoreColor?: string;
  /** Empty-axis label tint (rendered at 0.5 opacity). Defaults to
   *  labelColor — caller should pass a more tertiary token (e.g.
   *  tokens.textTer) for the muted state. */
  mutedLabelColor?: string;
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
  /** When ALL axes are empty (no measurement anywhere), this string
   *  renders as a small line below the SVG. Hidden on any populated
   *  state; omitted entirely when prop unset. */
  emptyHint?: string;
  /** Font family for emptyHint. Defaults to system. */
  emptyHintFontFamily?: string;
}

export function LifeMapRadar({
  areas,
  size = 300,
  labelColor = "#71717A",
  scoreColor = "#A1A1AA",
  mutedLabelColor,
  gridColor = "#E4E4E7",
  centerLabelColor = "#18181B",
  onAreaPress,
  selectedAreaKey,
  trendAreas,
  gradientColors,
  labelFontFamily,
  scoreFontFamily,
  nodeStrokeColor = "white",
  emptyHint,
  emptyHintFontFamily,
}: Props) {
  // Default muted color falls back to populated labelColor when caller
  // doesn't supply a distinct one. Empty-axis opacity (0.5) is applied
  // at the SVG element so the same hex still works for either token.
  const resolvedMutedLabelColor = mutedLabelColor ?? labelColor;
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

  // Per-axis score resolution + populated flag — computed once and
  // reused across polygon construction, trend overlay, and per-axis
  // render block. Score lookup keys on .area so the API response
  // (uppercase enum value like "CAREER") matches DEFAULT_LIFE_AREAS.enum.
  const perAxis = areaConfigs.map((config, i) => {
    const area = areas.find(
      (a) => a.area === config.enum || a.area === config.name
    );
    const score100 = resolveScore100(area);
    const populated = isPopulated(score100);
    return { config, i, area, score100, populated };
  });

  // Data polygon — only includes populated axes. Closes the path
  // across whatever's measured. If fewer than 2 axes are populated,
  // a polygon shape isn't meaningful, so we skip rendering it.
  const populatedAxes = perAxis.filter((a) => a.populated);
  const polyPoints =
    populatedAxes.length >= 2
      ? populatedAxes
          .map((a) => {
            const r = ((a.score100 ?? 0) / 100) * maxR;
            const p = getPoint(a.i, r);
            return `${p.x},${p.y}`;
          })
          .join(" ")
      : null;

  // Trend overlay — per-axis ~4-weeks-ago score. Same populated-only
  // filter so the dashed shape doesn't fabricate trend data for axes
  // that had no measurement then. Trend data still uses the legacy
  // 1-10 `score` shape (history table predates Slice N); converted
  // to 0-100 via *10. Falls back to current score when trend null
  // (zero-delta for that axis).
  const trendPolyPoints = (() => {
    if (!trendAreas) return null;
    const points: string[] = [];
    for (const { config, i, score100: currentScore } of perAxis) {
      const t = trendAreas.find((ta) => ta.area === config.enum);
      const trendScore =
        t?.score != null
          ? Math.max(0, Math.min(100, t.score * 10))
          : (currentScore ?? 0);
      if (trendScore <= 0) continue;
      const p = getPoint(i, (trendScore / 100) * maxR);
      points.push(`${p.x},${p.y}`);
    }
    return points.length >= 2 ? points.join(" ") : null;
  })();

  const allEmpty = populatedAxes.length === 0;

  // Q7 polish — palette gradient on the data polygon when caller
  // supplies endpoint colors. Stable id (one radar per Insights tab
  // in practice; if multiple render, callers can wrap to scope).
  const polyFill = gradientColors ? "url(#lifemap-poly-fill)" : "#7C3AED";
  const polyStroke = gradientColors ? "url(#lifemap-poly-stroke)" : "#7C3AED";

  const svg = (
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

      {/* Data polygon — only rendered when 2+ axes are populated.
          Palette gradient when caller passes gradientColors (Q7 polish);
          falls back to legacy violet for old consumers. The polygon
          only spans populated vertices, so its shape is irregular for
          mid-history users and absent for brand-new ones. */}
      {polyPoints && (
        <Polygon
          points={polyPoints}
          fill={polyFill}
          fillOpacity={gradientColors ? 1 : 0.12}
          stroke={polyStroke}
          strokeWidth={1.5}
        />
      )}

      {/* Area nodes + axis labels. Each axis is tappable via its own
          G wrapper so the touch target covers the node + label + score
          text in one hit — fingers don't hit a 4px SVG circle.
          Populated axes get a filled palette dot at their vertex
          radius; empty axes get a hollow ring at the outer 100% radius
          + muted label + "—" value. */}
      {perAxis.map(({ config, i, score100, populated }) => {
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

        if (!populated) {
          // Empty axis — hollow ring at outer 100% radius, muted label
          // at 0.5 opacity, "—" instead of a numeric value.
          const ringP = getPoint(i, maxR);
          return (
            <G key={`node-${config.enum}`} onPress={handlePress}>
              <Circle
                cx={ringP.x}
                cy={ringP.y}
                r={4.5}
                fill="none"
                stroke={resolvedMutedLabelColor}
                strokeWidth={1.25}
                strokeOpacity={0.5}
              />
              <SvgText
                x={labelP.x}
                y={labelP.y}
                textAnchor="middle"
                fontSize={labelFontSize}
                fontWeight={isSelected ? "700" : "500"}
                fill={isSelected ? config.color : resolvedMutedLabelColor}
                fillOpacity={isSelected ? 1 : 0.5}
                fontFamily={labelFontFamily}
              >
                {labelText}
              </SvgText>
              <SvgText
                x={labelP.x}
                y={labelP.y + labelFontSize + 2}
                textAnchor="middle"
                fontSize={9}
                fill={resolvedMutedLabelColor}
                fillOpacity={0.5}
                fontFamily={scoreFontFamily}
              >
                —
              </SvgText>
            </G>
          );
        }

        // Populated axis — filled dot at the polygon vertex radius.
        const nodeR = ((score100 ?? 0) / 100) * maxR;
        const nodeP = getPoint(i, nodeR);
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
              {score100?.toString() ?? "—"}
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

  // Wrap in a View when emptyHint is provided so we can render the
  // hint string below the SVG. When emptyHint is unset OR there's
  // any populated axis, the radar still returns the bare SVG so
  // existing callers' layout doesn't shift.
  if (emptyHint && allEmpty) {
    return (
      <View style={{ alignItems: "center" }}>
        {svg}
        <Text
          style={{
            color: resolvedMutedLabelColor,
            opacity: 0.7,
            fontSize: 12,
            fontFamily: emptyHintFontFamily,
            marginTop: 8,
            textAlign: "center",
            paddingHorizontal: 24,
          }}
        >
          {emptyHint}
        </Text>
      </View>
    );
  }
  return svg;
}
