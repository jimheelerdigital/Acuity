import { Text, View } from "react-native";
import Svg, {
  Circle,
  Defs,
  LinearGradient,
  Path,
  RadialGradient,
  Rect,
  Stop,
} from "react-native-svg";

/**
 * Smooth area chart for theme trend. For <3 non-zero points, renders
 * a gradient placeholder card with the mention count centered and a
 * "not enough data yet" hint. For 3+ points, builds a monotone cubic
 * bezier path through the data points with a closed region filled by
 * a vertical gradient fading from the sentiment color (top) to
 * transparent (bottom).
 *
 * Smoothing approach — monotone cubic:
 *   Each segment between (x0,y0) and (x1,y1) gets control points
 *   computed so slopes at data points match a monotone interpolation
 *   (no synthetic peaks/dips between samples). The formula used is
 *   the standard Fritsch-Carlson monotone cubic, simplified for the
 *   even-x-spacing case. The net visual: organic curves that never
 *   overshoot the data — ideal for mention-count trends that can't
 *   go negative.
 *
 * Y-axis: intentionally invisible. X-axis: 4 spaced labels driven by
 * the `xLabels` prop (parent computes them from the date range).
 */
export function AreaChart({
  trend,
  color,
  mentionCount,
  xLabels,
}: {
  trend: number[];
  color: string;
  mentionCount: number;
  xLabels: string[];
}) {
  const nonZero = trend.filter((v) => v > 0).length;

  if (nonZero < 3) {
    return <Placeholder color={color} mentionCount={mentionCount} />;
  }

  const W = 600;
  const H = 180;
  const PAD_Y = 16;

  const max = Math.max(...trend, 1);
  const stepX = W / (trend.length - 1);
  const points = trend.map((v, i) => ({
    x: i * stepX,
    y: PAD_Y + (H - 2 * PAD_Y) * (1 - v / max),
  }));

  const curve = monotoneCubicPath(points);
  const area = `${curve} L ${W} ${H} L 0 ${H} Z`;

  // Only the endpoint gets a visible dot — matches the purple/pink
  // wave-chart reference where the shape is the primary read and
  // dots would clutter the silhouette.
  const endpointIdx = points.length - 1;

  return (
    <View
      style={{
        borderRadius: 24,
        overflow: "hidden",
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.06)",
        padding: 16,
      }}
    >
      <Svg
        width="100%"
        height="100%"
        style={{ position: "absolute", inset: 0 }}
        pointerEvents="none"
      >
        <Defs>
          <RadialGradient id="chart-bg" cx="50%" cy="100%" r="110%">
            <Stop offset="0%" stopColor={color} stopOpacity={0.14} />
            <Stop offset="55%" stopColor="#1E1B4B" stopOpacity={0.7} />
            <Stop offset="100%" stopColor="#0B0B12" stopOpacity={1} />
          </RadialGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#chart-bg)" />
      </Svg>

      <Svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        width="100%"
        height={H}
      >
        <Defs>
          <LinearGradient id="area-fill" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0%" stopColor={color} stopOpacity={0.55} />
            <Stop offset="55%" stopColor={color} stopOpacity={0.18} />
            <Stop offset="100%" stopColor={color} stopOpacity={0} />
          </LinearGradient>
          <LinearGradient id="area-stroke" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0%" stopColor={color} stopOpacity={0.8} />
            <Stop offset="100%" stopColor={color} stopOpacity={1} />
          </LinearGradient>
        </Defs>

        <Path d={area} fill="url(#area-fill)" />
        {/* Soft outer glow — wider, translucent stroke beneath the main line */}
        <Path
          d={curve}
          fill="none"
          stroke={color}
          strokeWidth={6}
          strokeLinejoin="round"
          strokeLinecap="round"
          opacity={0.22}
        />
        <Path
          d={curve}
          fill="none"
          stroke="url(#area-stroke)"
          strokeWidth={3}
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {/* Endpoint marker */}
        <Circle
          cx={points[endpointIdx].x}
          cy={points[endpointIdx].y}
          r={9}
          fill={color}
          opacity={0.22}
        />
        <Circle
          cx={points[endpointIdx].x}
          cy={points[endpointIdx].y}
          r={4.5}
          fill={color}
          stroke="#0B0B12"
          strokeWidth={2}
        />
      </Svg>

      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          marginTop: 12,
          paddingHorizontal: 4,
        }}
      >
        {xLabels.map((l, i) => (
          <Text
            key={`${l}-${i}`}
            style={{
              fontSize: 10,
              color: "rgba(161,161,170,0.55)",
              fontWeight: "600",
              letterSpacing: 0.8,
              textTransform: "uppercase",
            }}
          >
            {l}
          </Text>
        ))}
      </View>
    </View>
  );
}

function Placeholder({
  color,
  mentionCount,
}: {
  color: string;
  mentionCount: number;
}) {
  return (
    <View
      style={{
        minHeight: 140,
        borderRadius: 20,
        overflow: "hidden",
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.06)",
        backgroundColor: "rgba(30,30,46,0.6)",
        padding: 24,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "baseline",
          gap: 4,
        }}
      >
        <Text
          style={{ color, fontSize: 44, fontWeight: "700", letterSpacing: -1 }}
        >
          {mentionCount}
        </Text>
        <Text
          style={{
            fontSize: 14,
            fontWeight: "500",
            color: "rgba(228,228,231,0.6)",
          }}
        >
          mention{mentionCount === 1 ? "" : "s"}
        </Text>
      </View>
      <Text
        style={{
          marginTop: 8,
          fontSize: 12,
          textAlign: "center",
          color: "rgba(161,161,170,0.7)",
        }}
      >
        Not enough data yet — check back after more entries.
      </Text>
    </View>
  );
}

/**
 * Monotone cubic interpolation through points with even x spacing.
 * Returns an SVG path "M x0 y0 C cx0a cy0a cx0b cy0b x1 y1 ..."
 *
 * Reference: Fritsch & Carlson, 1980 — but specialized for the
 * regular-x-grid case we have (one sample per day over 30 days).
 */
function monotoneCubicPath(points: { x: number; y: number }[]): string {
  if (points.length === 0) return "";
  if (points.length === 1) {
    return `M ${points[0].x} ${points[0].y}`;
  }
  if (points.length === 2) {
    return `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y}`;
  }

  const n = points.length;
  const dxs: number[] = new Array(n - 1);
  const slopes: number[] = new Array(n - 1);
  for (let i = 0; i < n - 1; i++) {
    dxs[i] = points[i + 1].x - points[i].x;
    slopes[i] = (points[i + 1].y - points[i].y) / dxs[i];
  }

  const tangents: number[] = new Array(n);
  tangents[0] = slopes[0];
  tangents[n - 1] = slopes[n - 2];
  for (let i = 1; i < n - 1; i++) {
    const m0 = slopes[i - 1];
    const m1 = slopes[i];
    if (m0 * m1 <= 0) {
      tangents[i] = 0;
    } else {
      tangents[i] = (m0 + m1) / 2;
    }
  }

  // Fritsch-Carlson monotonicity correction.
  for (let i = 0; i < n - 1; i++) {
    if (slopes[i] === 0) {
      tangents[i] = 0;
      tangents[i + 1] = 0;
      continue;
    }
    const a = tangents[i] / slopes[i];
    const b = tangents[i + 1] / slopes[i];
    const h = Math.hypot(a, b);
    if (h > 3) {
      const t = 3 / h;
      tangents[i] = t * a * slopes[i];
      tangents[i + 1] = t * b * slopes[i];
    }
  }

  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < n - 1; i++) {
    const p0 = points[i];
    const p1 = points[i + 1];
    const dx = dxs[i];
    const cp1x = p0.x + dx / 3;
    const cp1y = p0.y + (tangents[i] * dx) / 3;
    const cp2x = p1.x - dx / 3;
    const cp2y = p1.y - (tangents[i + 1] * dx) / 3;
    d += ` C ${cp1x} ${cp1y} ${cp2x} ${cp2y} ${p1.x} ${p1.y}`;
  }
  return d;
}

