/**
 * Ripple Sparkbar — web mirror of `apps/mobile/components/acuity/
 * Sparkbar.tsx`. Per DESIGN_SYSTEM.md §5.10.
 *
 * Small bar chart for weekly cards. The last bar (today / most-recent)
 * renders with a vertical primary gradient; prior bars use a single
 * neutral hairline. This is the "current vs context" emphasis pattern
 * — keeps the bar from pulling attention away from the surrounding
 * stat number.
 *
 * Heights normalize against the max value with an 8% floor so empty
 * days are visible — a zero would collapse the bar into the baseline.
 *
 * For the 28-night heatmap-style usage on /entries, see
 * `app/entries/_components/heatmap-28.tsx` — that surface uses a
 * different layout (28 cells, fade-by-age) and intentionally doesn't
 * share this primitive.
 */

export interface SparkbarProps {
  /** Values (any length; scaling is uniform against max). */
  values: number[];
  /** Total height in px. Default 28. */
  height?: number;
  /** Gap between bars in px. Default 3. */
  gap?: number;
  className?: string;
}

export function Sparkbar({
  values,
  height = 28,
  gap = 3,
  className = "",
}: SparkbarProps) {
  if (values.length === 0) return null;
  const max = Math.max(...values, 1);

  return (
    <div
      className={`flex items-end ${className}`}
      style={{ height, gap }}
      aria-hidden="true"
    >
      {values.map((v, i) => {
        const isLast = i === values.length - 1;
        const h = Math.max(0.08, v / max) * height;
        return (
          <div
            key={i}
            className="flex-1 rounded-[3px] overflow-hidden"
            style={{
              height: h,
              background: isLast
                ? "linear-gradient(180deg, var(--acuity-primary-hi), var(--acuity-primary))"
                : "var(--acuity-line-strong)",
            }}
          />
        );
      })}
    </div>
  );
}
