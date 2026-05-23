/**
 * Acuity MiniRadar — web mirror of `apps/mobile/components/acuity/
 * MiniRadar.tsx`. Per DESIGN_SYSTEM.md §5.12.
 *
 * Small N-axis radar polygon. Web port lands on the **10-axis canon**
 * per Phase D (`packages/shared/src/constants.ts → LIFE_AREAS`) —
 * mobile's primitive still ships 12 for the deprecated onboarding
 * baseline carousel. Web has no such legacy consumer, so default to 10.
 *
 * Renders concentric grid rings + axis spokes + a score polygon with
 * gradient fill and stroke. Vertex dots highlight at each scored axis;
 * a `highlightAxis` index gets a pulsing-ready glow ring (no animation
 * in this primitive — consumer can wrap in CSS keyframes if needed).
 *
 * Empty-axis treatment per DESIGN_SYSTEM.md §5.16: when an axis has
 * score=0, the vertex collapses to the center. The polygon spans only
 * scored axes so a partially-filled radar doesn't look like a tiny
 * star at the middle.
 */

export interface MiniRadarProps {
  /** N values 0-100. `null` for un-scored axes (renders at 0). */
  scores: (number | null)[];
  /** Index of the axis currently being scored (pulsing glow). */
  highlightAxis?: number;
  /** SVG diameter in px. Default 130 matches onboarding preview. */
  size?: number;
  /** Axis count — defaults to scores.length. */
  axisCount?: number;
  className?: string;
}

export function MiniRadar({
  scores,
  highlightAxis,
  size = 130,
  axisCount,
  className = "",
}: MiniRadarProps) {
  const padding = 12;
  const cx = size / 2;
  const cy = size / 2;
  const maxR = (size - padding * 2) / 2;
  const count = axisCount ?? scores.length;

  // Convert axis index to angle in radians. 0 = top (−90° in math
  // convention); rotates clockwise.
  const angle = (i: number) => -Math.PI / 2 + (i * 2 * Math.PI) / count;

  // Polygon points from scored axes. Empty axes contribute a center
  // vertex (collapses the polygon at that side), so a sparse radar
  // looks like a star rather than a circle.
  const points = Array.from({ length: count }, (_, i) => {
    const v = scores[i] ?? 0;
    const r = (Math.max(0, Math.min(100, v)) / 100) * maxR;
    const a = angle(i);
    return `${cx + Math.cos(a) * r},${cy + Math.sin(a) * r}`;
  }).join(" ");

  // 4 concentric grid rings (25/50/75/100% of maxR).
  const gridRings = [0.25, 0.5, 0.75, 1].map((scale) =>
    Array.from({ length: count }, (_, i) => {
      const r = scale * maxR;
      const a = angle(i);
      return `${cx + Math.cos(a) * r},${cy + Math.sin(a) * r}`;
    }).join(" ")
  );

  const gradientId = `mini-radar-${size}`;

  return (
    <svg
      width={size}
      height={size}
      className={className}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={`${gradientId}-fill`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="var(--acuity-primary)" stopOpacity={0.35} />
          <stop offset="100%" stopColor="var(--acuity-secondary)" stopOpacity={0.35} />
        </linearGradient>
        <linearGradient id={`${gradientId}-stroke`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="var(--acuity-primary)" />
          <stop offset="100%" stopColor="var(--acuity-secondary)" />
        </linearGradient>
      </defs>

      {/* Concentric grid rings */}
      {gridRings.map((pts, idx) => (
        <polygon
          key={idx}
          points={pts}
          fill="none"
          stroke={
            idx === gridRings.length - 1
              ? "var(--acuity-line-strong)"
              : "var(--acuity-line)"
          }
          strokeWidth={0.5}
        />
      ))}

      {/* Axis spokes */}
      {Array.from({ length: count }, (_, i) => {
        const a = angle(i);
        return (
          <line
            key={`spoke-${i}`}
            x1={cx}
            y1={cy}
            x2={cx + Math.cos(a) * maxR}
            y2={cy + Math.sin(a) * maxR}
            stroke="var(--acuity-line)"
            strokeWidth={0.5}
          />
        );
      })}

      {/* Score polygon */}
      <polygon
        points={points}
        fill={`url(#${gradientId}-fill)`}
        stroke={`url(#${gradientId}-stroke)`}
        strokeWidth={1.5}
        strokeLinejoin="round"
      />

      {/* Vertex dots — one per axis with score > 0 */}
      {scores.map((v, i) => {
        if (v == null || v <= 0) return null;
        const clamped = Math.max(0, Math.min(100, v));
        const r = (clamped / 100) * maxR;
        const a = angle(i);
        const x = cx + Math.cos(a) * r;
        const y = cy + Math.sin(a) * r;
        const isHighlight = i === highlightAxis;
        return (
          <g key={`dot-${i}`}>
            {isHighlight && (
              <circle
                cx={x}
                cy={y}
                r={6}
                fill="none"
                stroke="var(--acuity-primary)"
                strokeWidth={1.5}
                opacity={0.6}
              />
            )}
            <circle
              cx={x}
              cy={y}
              r={isHighlight ? 3 : 2}
              fill={
                isHighlight ? "var(--acuity-primary)" : "var(--acuity-text)"
              }
            />
          </g>
        );
      })}
    </svg>
  );
}
