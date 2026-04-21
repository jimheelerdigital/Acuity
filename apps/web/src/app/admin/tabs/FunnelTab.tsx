"use client";

import { SkeletonChart } from "../components/SkeletonCard";
import { useTabData } from "./useTabData";

interface FunnelData {
  steps: { label: string; count: number }[];
}

export default function FunnelTab({
  start,
  end,
}: {
  start: string;
  end: string;
}) {
  const { data, loading } = useTabData<FunnelData>("funnel", start, end);

  if (loading || !data) {
    return <SkeletonChart />;
  }

  const maxCount = Math.max(...data.steps.map((s) => s.count), 1);

  return (
    <div className="rounded-xl bg-[#13131F] p-6">
      <h3 className="mb-6 text-sm font-medium text-white/60">
        User Funnel
      </h3>
      <div className="space-y-3 max-w-3xl mx-auto">
        {data.steps.map((step, i) => {
          const pct = (step.count / maxCount) * 100;
          const prevCount = i > 0 ? data.steps[i - 1].count : null;
          const dropOff =
            prevCount != null && prevCount > 0
              ? Math.round(((prevCount - step.count) / prevCount) * 100)
              : null;
          const stepPct =
            prevCount != null && prevCount > 0
              ? Math.round((step.count / prevCount) * 100)
              : null;

          return (
            <div key={step.label}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm text-white/70">{step.label}</span>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-bold text-white">
                    {step.count.toLocaleString()}
                  </span>
                  {stepPct != null && (
                    <span className="text-xs text-white/30">
                      {stepPct}% of prev
                    </span>
                  )}
                  {dropOff != null && dropOff > 0 && (
                    <span className="text-xs text-red-400/60">
                      -{dropOff}% drop
                    </span>
                  )}
                </div>
              </div>
              <div className="h-8 w-full overflow-hidden rounded bg-white/5">
                <div
                  className="h-full rounded bg-gradient-to-r from-[#7C5CFC] to-[#9B7DFF] transition-all"
                  style={{ width: `${Math.max(pct, 2)}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
      {data.steps.every((s) => s.count === 0) && (
        <p className="mt-6 text-sm text-white/30 text-center">
          Not enough data — comes online after users move through the funnel
        </p>
      )}
    </div>
  );
}
