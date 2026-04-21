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
 * Data contract (matches /api/lifemap): each area in `areas` carries
 * a 0..10 `score`; the polygon vertex for that axis sits at
 * `(score / 10) * maxRadius` from center.
 *
 * Size: the SVG is viewBox-driven, so the caller controls rendered
 * pixel size via the `size` prop (defaults to 300 to match the web
 * max-width).
 */

export interface RadarArea {
  area: LifeArea | string;
  score: number;
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
      const score = area ? area.score / 10 : 0;
      const r = score * maxR;
      const p = getPoint(i, r);
      return `${p.x},${p.y}`;
    })
    .join(" ");

  // Trend overlay — per-axis ~4-weeks-ago score. Null = no data for
  // that axis, collapse to the current score so the polygon remains
  // closed (no weird zero-collapse toward center).
  const trendPolyPoints = trendAreas
    ? areaConfigs
        .map((config, i) => {
          const t = trendAreas.find((ta) => ta.area === config.enum);
          const current = areas.find(
            (a) => a.area === config.enum || a.area === config.name
          );
          const score10 =
            t?.score != null
              ? Math.max(0, Math.min(10, t.score / 10))
              : current
                ? current.score / 10
                : 0;
          const p = getPoint(i, score10 * maxR);
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
              {area ? Math.round(area.score * 10).toString() : "—"}
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
