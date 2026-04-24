"use client";

/**
 * Smooth area chart — parity with mobile AreaChart. Monotone cubic
 * through the data points, vertical gradient fill under the line.
 * <3 non-zero points renders a gradient placeholder card instead.
 *
 * The monotone cubic routine mirrors the mobile implementation line
 * for line so visual output matches on both surfaces.
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
  const PAD_Y = 14;

  const max = Math.max(...trend, 1);
  const stepX = W / (trend.length - 1);
  const points = trend.map((v, i) => ({
    x: i * stepX,
    y: PAD_Y + (H - 2 * PAD_Y) * (1 - v / max),
  }));

  const curve = monotoneCubicPath(points);
  const area = `${curve} L ${W} ${H} L 0 ${H} Z`;

  const dotIndices = pickDotIndices(points.length, 5);

  return (
    <div
      className="overflow-hidden rounded-3xl border p-4"
      style={{
        borderColor: "rgba(255,255,255,0.06)",
        backgroundColor: "rgba(30,30,46,0.6)",
      }}
    >
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="block w-full"
        style={{ height: H }}
      >
        <defs>
          <linearGradient id="web-area-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.35} />
            <stop offset="70%" stopColor={color} stopOpacity={0.08} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <path d={area} fill="url(#web-area-fill)" />
        <path
          d={curve}
          fill="none"
          stroke={color}
          strokeWidth={2.5}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {dotIndices.map((i) => (
          <circle
            key={i}
            cx={points[i].x}
            cy={points[i].y}
            r={4}
            fill="#0B0B12"
            stroke={color}
            strokeWidth={2}
          />
        ))}
      </svg>

      <div className="mt-3 flex justify-between px-1">
        {xLabels.map((l, i) => (
          <span
            key={`${l}-${i}`}
            style={{
              fontSize: 11,
              color: "rgba(161,161,170,0.7)",
              fontWeight: 500,
            }}
          >
            {l}
          </span>
        ))}
      </div>
    </div>
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
    <div
      className="relative flex flex-col items-center justify-center overflow-hidden rounded-3xl border px-6 py-8"
      style={{
        minHeight: 160,
        borderColor: "rgba(255,255,255,0.06)",
        backgroundColor: "rgba(30,30,46,0.6)",
      }}
      aria-label={`${mentionCount} mention${mentionCount === 1 ? "" : "s"} — not enough data for a trend yet`}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-30"
        style={{
          background: `radial-gradient(circle at center, ${color}33 0%, transparent 60%)`,
        }}
      />
      <div className="relative flex items-baseline gap-1 tabular-nums">
        <span
          className="font-bold"
          style={{ color, fontSize: 44, letterSpacing: "-1px" }}
        >
          {mentionCount}
        </span>
        <span
          style={{
            fontSize: 14,
            fontWeight: 500,
            color: "rgba(228,228,231,0.6)",
          }}
        >
          mention{mentionCount === 1 ? "" : "s"}
        </span>
      </div>
      <p
        className="relative mt-2 max-w-xs text-center"
        style={{ fontSize: 12, color: "rgba(161,161,170,0.7)" }}
      >
        Not enough data yet — check back after more entries.
      </p>
    </div>
  );
}

function monotoneCubicPath(points: { x: number; y: number }[]): string {
  if (points.length === 0) return "";
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  if (points.length === 2)
    return `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y}`;

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
    tangents[i] = m0 * m1 <= 0 ? 0 : (m0 + m1) / 2;
  }

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

function pickDotIndices(n: number, count: number): number[] {
  if (n <= count) return Array.from({ length: n }, (_, i) => i);
  const out: number[] = [];
  for (let i = 0; i < count; i++) {
    out.push(Math.round((i * (n - 1)) / (count - 1)));
  }
  return out;
}
