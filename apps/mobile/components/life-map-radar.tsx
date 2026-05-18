import {
  Circle,
  G,
  Line,
  Polygon,
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
 * pixel size via the `size` prop (defaults to 300 to match the web
 * max-width).
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

interface Props {
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
  const polyPoints = areaConfigs
    .map((config, i) => {
      const area = areas.find(
        (a) => a.area === config.enum || a.area === config.name
      );
      const score100 = resolveScore100(area);
      const r = (score100 ?? 0) / 100 * maxR;
      const p = getPoint(i, r);
      return `${p.x},${p.y}`;
    })
    .join(" ");

  // Trend overlay — per-axis ~4-weeks-ago score. Null = no data for
  // that axis, collapse to the current score so the polygon remains
  // closed (no weird zero-collapse toward center).
  //
  // Trend data still uses the legacy 1-10 `score` shape (history
  // table predates Slice N). Convert to 0-100 via *10 for the
  // polygon math.
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
          const p = getPoint(i, (score100 / 100) * maxR);
          return `${p.x},${p.y}`;
        })
        .join(" ")
    : null;

  return (
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
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

      {/* Data polygon — violet fill at 12% opacity, solid violet stroke */}
      <Polygon
        points={polyPoints}
        fill="#7C3AED"
        fillOpacity={0.12}
        stroke="#7C3AED"
        strokeWidth={1.5}
      />

      {/* Area nodes + axis labels. Each axis is tappable via its own
          G wrapper so the touch target covers the node + label + score
          text in one hit — fingers don't hit a 4px SVG circle. */}
      {areaConfigs.map((config, i) => {
        const area = areas.find(
          (a) => a.area === config.enum || a.area === config.name
        );
        const score = area ? area.score / 10 : 0;
        const nodeR = score * maxR;
        const nodeP = getPoint(i, nodeR);
        const labelP = getPoint(i, maxR + size * 0.06);
        const isSelected =
          selectedAreaKey !== null &&
          selectedAreaKey !== undefined &&
          (selectedAreaKey === config.enum || selectedAreaKey === config.name);
        const handlePress = onAreaPress
          ? () => onAreaPress(config.enum)
          : undefined;

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
              stroke="white"
              strokeWidth={2}
            />
            <SvgText
              x={labelP.x}
              y={labelP.y}
              textAnchor="middle"
              fontSize={10}
              fontWeight={isSelected ? "700" : "500"}
              fill={isSelected ? config.color : labelColor}
            >
              {config.name}
            </SvgText>
            <SvgText
              x={labelP.x}
              y={labelP.y + 12}
              textAnchor="middle"
              fontSize={9}
              fill={scoreColor}
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
