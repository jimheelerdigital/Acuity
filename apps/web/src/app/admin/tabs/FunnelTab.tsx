"use client";

import { useState } from "react";

import RefreshButton from "../components/RefreshButton";
import { SkeletonChart } from "../components/SkeletonCard";
import { DrilldownModal } from "../components/DrilldownModal";
import { useTabData } from "./useTabData";

interface FunnelData {
  steps: { label: string; count: number }[];
}

const STEP_KEY: Record<string, string> = {
  "Waitlist Signups": "waitlist",
  "Account Created": "account",
  "First Recording": "first_recording",
  "Active Day 3": "active_d3",
  "Active Day 7": "active_d7",
  "Converted to Paid": "converted",
};

export default function FunnelTab({
  start,
  end,
}: {
  start: string;
  end: string;
}) {
  const { data, loading, meta, refresh } = useTabData<FunnelData>("funnel", start, end);
  const [drilldown, setDrilldown] = useState<{
    step: string;
    label: string;
  } | null>(null);

  if (loading || !data) {
    return <SkeletonChart />;
  }

  const maxCount = Math.max(...data.steps.map((s) => s.count), 1);

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <RefreshButton computedAt={meta?.computedAt ?? null} onRefresh={refresh} loading={loading} />
      </div>

      <div className="rounded-xl bg-[#13131F] p-6">
        <h3 className="mb-2 text-sm font-medium text-white/60">
          User Funnel
        </h3>
        <p className="mb-6 rounded-md border border-amber-500/20 bg-amber-900/10 px-3 py-2 text-[11px] text-amber-300/70">
          Heads up: the Waitlist row counts every waitlist signup in the
          range, and the Account Created row counts every new User in the
          range — they are independent populations, not joined by email.
          The drop-off % between those two rows is therefore not meaningful
          until Slice 3 (Waitlist→User email match) ships. Steps from
          Account Created downward are joined correctly.
        </p>
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

            const stepKey = STEP_KEY[step.label];
            const drillable = stepKey && stepKey !== "active_d3"; // d3 not in API yet
            return (
              <button
                key={step.label}
                type="button"
                disabled={!drillable || step.count === 0}
                onClick={() =>
                  drillable &&
                  setDrilldown({ step: stepKey, label: step.label })
                }
                className={`block w-full text-left ${
                  drillable && step.count > 0
                    ? "cursor-pointer hover:opacity-90"
                    : "cursor-default"
                }`}
              >
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
              </button>
            );
          })}
        </div>
        {data.steps.every((s) => s.count === 0) && (
          <p className="mt-6 text-sm text-white/30 text-center">
            Not enough data — comes online after users move through the funnel
          </p>
        )}
      </div>

      {drilldown && (
        <DrilldownModal
          metric="funnel_step"
          start={start}
          end={end}
          fallbackTitle={drilldown.label}
          params={{ step: drilldown.step }}
          onClose={() => setDrilldown(null)}
        />
      )}
    </div>
  );
}
