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
}

export function LifeMapRadar({
  areas,
  size = 300,
  labelColor = "#71717A",
  scoreColor = "#A1A1AA",
  gridColor = "#E4E4E7",
  centerLabelColor = "#18181B",
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

      {/* Data polygon — violet fill at 12% opacity, solid violet stroke */}
      <Polygon
        points={polyPoints}
        fill="#7C3AED"
        fillOpacity={0.12}
        stroke="#7C3AED"
        strokeWidth={1.5}
      />

      {/* Area nodes + axis labels */}
      {areaConfigs.map((config, i) => {
        const area = areas.find(
          (a) => a.area === config.enum || a.area === config.name
        );
        const score = area ? area.score / 10 : 0;
        const nodeR = score * maxR;
        const nodeP = getPoint(i, nodeR);
        const labelP = getPoint(i, maxR + size * 0.06);

        return (
          <G key={`node-${config.enum}`}>
            <Circle
              cx={nodeP.x}
              cy={nodeP.y}
              r={4.5}
              fill={config.color}
              stroke="white"
              strokeWidth={2}
            />
            <SvgText
              x={labelP.x}
              y={labelP.y}
              textAnchor="middle"
              fontSize={10}
              fontWeight="500"
              fill={labelColor}
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
