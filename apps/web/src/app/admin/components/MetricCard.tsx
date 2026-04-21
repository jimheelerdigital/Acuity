"use client";

import {
  ResponsiveContainer,
  AreaChart,
  Area,
} from "recharts";

interface Props {
  label: string;
  value: string | number;
  previousValue?: number | null;
  currentValue?: number | null;
  sparklineData?: { v: number }[];
  format?: "number" | "currency" | "percent";
  budgetBar?: { current: number; max: number };
}

export default function MetricCard({
  label,
  value,
  previousValue,
  currentValue,
  sparklineData,
  budgetBar,
}: Props) {
  let badge: React.ReactNode = null;
  if (previousValue != null && currentValue != null && previousValue > 0) {
    const pctChange = ((currentValue - previousValue) / previousValue) * 100;
    if (Math.abs(pctChange) < 0.5) {
      badge = <span className="text-xs text-white/30">—</span>;
    } else if (pctChange > 0) {
      badge = (
        <span className="text-xs font-medium text-green-400">
          +{pctChange.toFixed(1)}%
        </span>
      );
    } else {
      badge = (
        <span className="text-xs font-medium text-red-400">
          {pctChange.toFixed(1)}%
        </span>
      );
    }
  } else if (previousValue != null || currentValue != null) {
    badge = <span className="text-xs text-white/30">&mdash;</span>;
  }

  return (
    <div className="rounded-xl bg-[#13131F] p-5 flex flex-col justify-between min-h-[140px]">
      <div className="flex items-start justify-between">
        <p className="text-[11px] font-medium uppercase tracking-widest text-white/40">
          {label}
        </p>
        {badge}
      </div>
      <div>
        <p className="mt-2 text-3xl font-bold text-white">{value}</p>
        {budgetBar && (
          <div className="mt-2">
            <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
              <div
                className={`h-full rounded-full transition-all ${
                  budgetBar.current / budgetBar.max > 0.9
                    ? "bg-red-500"
                    : budgetBar.current / budgetBar.max > 0.75
                      ? "bg-amber-500"
                      : "bg-[#7C5CFC]"
                }`}
                style={{
                  width: `${Math.min((budgetBar.current / budgetBar.max) * 100, 100)}%`,
                }}
              />
            </div>
          </div>
        )}
      </div>
      {sparklineData && sparklineData.length > 1 && (
        <div className="mt-2 h-8">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={sparklineData}>
              <defs>
                <linearGradient id="sparkGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#7C5CFC" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#7C5CFC" stopOpacity={0} />
                </linearGradient>
              </defs>
              <Area
                type="monotone"
                dataKey="v"
                stroke="#7C5CFC"
                fill="url(#sparkGrad)"
                strokeWidth={1.5}
                dot={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
