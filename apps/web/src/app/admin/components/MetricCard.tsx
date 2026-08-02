"use client";

// Recharts removed — sparkline uses CSS bars

interface Props {
  label: string;
  value: string | number;
  previousValue?: number | null;
  currentValue?: number | null;
  sparklineData?: { v: number }[];
  format?: "number" | "currency" | "percent";
  budgetBar?: { current: number; max: number };
  title?: string;
  onClick?: () => void;
}

export default function MetricCard({
  label,
  value,
  previousValue,
  currentValue,
  sparklineData,
  budgetBar,
  title,
  onClick,
}: Props) {
  let badge: React.ReactNode = null;
  if (previousValue != null && currentValue != null && previousValue > 0) {
    const pctChange = ((currentValue - previousValue) / previousValue) * 100;
    if (Math.abs(pctChange) < 0.5) {
      badge = (
        <span className="text-[13px] text-acuity-text-quiet tabular-nums">—</span>
      );
    } else if (pctChange > 0) {
      badge = (
        <span className="text-[13px] font-medium text-acuity-good tabular-nums">
          +{pctChange.toFixed(1)}%
        </span>
      );
    } else {
      badge = (
        <span className="text-[13px] font-medium text-acuity-bad tabular-nums">
          {pctChange.toFixed(1)}%
        </span>
      );
    }
  } else if (previousValue != null || currentValue != null) {
    badge = (
      <span className="text-[13px] text-acuity-text-quiet">&mdash;</span>
    );
  }

  const baseClass =
    "rounded-acuity-lg bg-acuity-card-bg border border-acuity-card-border shadow-acuity-soft flex flex-col justify-between min-h-[160px]";
  const Wrapper = onClick ? "button" : "div";
  const wrapperProps = onClick
    ? {
        type: "button" as const,
        onClick,
        className: `${baseClass} w-full cursor-pointer text-left transition duration-acuity-base ease-acuity-standard hover:shadow-acuity-lift hover:border-acuity-line-strong focus:outline-none focus-visible:ring-2 focus-visible:ring-acuity-primary`,
        style: { padding: 20 },
      }
    : {
        className: baseClass,
        style: { padding: 20 },
      };

  return (
    <Wrapper {...wrapperProps} title={title}>
      <div className="flex items-start justify-between gap-3">
        <p className="font-mono text-[11px] font-bold uppercase tracking-[1.4px] text-acuity-text-ter">
          {label}
        </p>
        {badge}
      </div>
      <div>
        <p
          className="mt-3 font-display font-bold text-acuity-text tabular-nums"
          style={{ fontSize: 34, letterSpacing: "-0.8px", lineHeight: 1.05 }}
        >
          {value}
        </p>
        {budgetBar && (
          <div className="mt-2">
            <div className="h-2 w-full overflow-hidden rounded-acuity-pill bg-acuity-bg-inset">
              <div
                className={`h-full rounded-acuity-pill transition-all ${
                  budgetBar.current / budgetBar.max > 0.9
                    ? "bg-acuity-bad"
                    : budgetBar.current / budgetBar.max > 0.75
                      ? "bg-acuity-warn"
                      : "bg-acuity-grad-primary"
                }`}
                style={{
                  width: `${Math.min((budgetBar.current / budgetBar.max) * 100, 100)}%`,
                }}
              />
            </div>
          </div>
        )}
      </div>
      {sparklineData && sparklineData.length > 1 && (() => {
        const max = Math.max(...sparklineData.map((d) => d.v), 1);
        const n = sparklineData.length;
        return (
          <div className="mt-2 flex h-8 items-end gap-px">
            {sparklineData.map((d, i) => (
              <div
                key={i}
                className="flex-1 rounded-t bg-acuity-primary"
                style={{
                  height: `${Math.max(2, (d.v / max) * 100)}%`,
                  // Today brightest, prior days descend (DESIGN_SYSTEM §5.10)
                  opacity: 0.25 + 0.75 * ((i + 1) / n),
                }}
              />
            ))}
          </div>
        );
      })()}
    </Wrapper>
  );
}
