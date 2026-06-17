"use client";

import ChartCard from "../components/ChartCard";
import MetricCard from "../components/MetricCard";
import { useTabData } from "./useTabData";

interface EngData {
  totalActivated: number;
  cohorts: {
    oneAndDone: number;
    dabbled: number;
    engaged: number;
    habit: number;
  };
  recorded3PlusDays: number;
  recorded7PlusDays: number;
  avgEntriesPerUser: number;
  avgDaysWithEntries: number;
  _error?: string;
}

const COHORTS = [
  { key: "oneAndDone", label: "One-and-done (1 entry)", color: "#FB7185" },
  { key: "dabbled", label: "Dabbled (2–4)", color: "#FBBF24" },
  { key: "engaged", label: "Engaged (5–14)", color: "#22D3EE" },
  { key: "habit", label: "Habit (15+)", color: "#34D399" },
] as const;

export default function EngagementDistributionTab({
  start,
  end,
}: {
  start: string;
  end: string;
}) {
  const { data, loading, error } = useTabData<EngData>(
    "engagement-distribution",
    start,
    end,
  );

  if (loading) return <div className="text-white/40">Loading…</div>;
  if (error || !data)
    return <div className="text-red-400">{error ?? "No data"}</div>;
  if (data._error) return <div className="text-red-400">{data._error}</div>;

  const total = data.totalActivated || 1;
  const pct = (n: number) => Math.round((1000 * n) / total) / 10;

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <MetricCard
          label="Activated users (1+ entry, in range)"
          value={data.totalActivated}
        />
      </div>

      <ChartCard title="Engagement distribution (% of activated users)">
        <div className="flex h-9 w-full overflow-hidden rounded">
          {COHORTS.map((c) => {
            const n = data.cohorts[c.key];
            const w = pct(n);
            return w > 0 ? (
              <div
                key={c.key}
                style={{ width: `${w}%`, background: c.color }}
                title={`${c.label}: ${n} (${w}%)`}
              />
            ) : null;
          })}
        </div>
        <div className="mt-4 flex flex-col gap-1.5">
          {COHORTS.map((c) => {
            const n = data.cohorts[c.key];
            return (
              <div key={c.key} className="flex items-center gap-2 text-sm">
                <span
                  className="inline-block h-3 w-3 rounded-sm"
                  style={{ background: c.color }}
                />
                <span className="text-white/70">{c.label}</span>
                <span className="ml-auto tabular-nums text-white/80">
                  {n} · {pct(n)}%
                </span>
              </div>
            );
          })}
        </div>
      </ChartCard>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <MetricCard label="Recorded on 3+ days" value={data.recorded3PlusDays} />
        <MetricCard label="Recorded on 7+ days" value={data.recorded7PlusDays} />
        <MetricCard label="Avg entries / user" value={data.avgEntriesPerUser} />
        <MetricCard
          label="Avg days with entries"
          value={data.avgDaysWithEntries}
        />
      </div>
    </div>
  );
}
