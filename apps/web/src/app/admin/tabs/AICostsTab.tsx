"use client";

import { useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import MetricCard from "../components/MetricCard";
import ChartCard from "../components/ChartCard";
import RefreshButton from "../components/RefreshButton";
import { DrilldownModal } from "../components/DrilldownModal";
import { SkeletonMetric, SkeletonChart, SkeletonTable } from "../components/SkeletonCard";
import { TabError } from "../components/TabError";
import { useTabData } from "./useTabData";

interface AICostsData {
  mtdSpendCents: number;
  budgetCents: number;
  byPurpose: { purpose: string; totalCents: number; calls: number }[];
  byDay: { date: string; totalCents: number; calls: number }[];
  recentCalls: {
    id: string;
    purpose: string;
    model: string;
    tokensIn: number;
    tokensOut: number;
    costCents: number;
    durationMs: number;
    success: boolean;
    errorMessage: string | null;
    createdAt: string;
  }[];
}

export default function AICostsTab({
  start,
  end,
}: {
  start: string;
  end: string;
}) {
  const { data, loading, error, meta, refresh } = useTabData<AICostsData>("ai-costs", start, end);
  const [filterPurpose, setFilterPurpose] = useState("");
  const [showBreakdown, setShowBreakdown] = useState(false);

  if (error && !data) {
    return <TabError message={error} onRetry={refresh} />;
  }

  if (loading || !data) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <SkeletonMetric key={i} />
          ))}
        </div>
        <SkeletonChart />
        <SkeletonTable />
      </div>
    );
  }

  const mtdDollars = (data.mtdSpendCents / 100).toFixed(2);
  const purposes = [...new Set(data.recentCalls.map((c) => c.purpose))];
  const filtered = filterPurpose
    ? data.recentCalls.filter((c) => c.purpose === filterPurpose)
    : data.recentCalls;

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <RefreshButton computedAt={meta?.computedAt ?? null} onRefresh={refresh} loading={loading} />
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        <MetricCard
          label="Claude Spend (Month-to-Date)"
          value={`$${mtdDollars}`}
          budgetBar={{
            current: data.mtdSpendCents,
            max: data.budgetCents,
          }}
          onClick={() => setShowBreakdown(true)}
        />
        <MetricCard
          label="Total Calls (period)"
          value={data.byDay.reduce((a, d) => a + d.calls, 0)}
          onClick={() => setShowBreakdown(true)}
        />
        <MetricCard
          label="Avg Cost/Call"
          value={(() => {
            const totalCalls = data.byDay.reduce((a, d) => a + d.calls, 0);
            const totalCents = data.byDay.reduce(
              (a, d) => a + d.totalCents,
              0
            );
            return totalCalls > 0
              ? `$${(totalCents / totalCalls / 100).toFixed(3)}`
              : "—";
          })()}
        />
      </div>

      {/* Spend by purpose */}
      <div className="rounded-xl bg-[#13131F] p-5">
        <h3 className="mb-3 text-sm font-medium text-white/60">
          Spend by Feature
        </h3>
        {data.byPurpose.length === 0 ? (
          <p className="text-sm text-white/30 py-6 text-center">
            No AI calls logged yet
          </p>
        ) : (
          <div className="space-y-2">
            {data.byPurpose.map((p) => {
              const maxCents = Math.max(
                ...data.byPurpose.map((x) => x.totalCents),
                1
              );
              return (
                <div key={p.purpose} className="flex items-center gap-3">
                  <span className="w-36 shrink-0 truncate text-sm text-white/70">
                    {p.purpose}
                  </span>
                  <div className="relative h-6 flex-1 overflow-hidden rounded bg-white/5">
                    <div
                      className="h-full rounded bg-[#7C5CFC]"
                      style={{
                        width: `${(p.totalCents / maxCents) * 100}%`,
                      }}
                    />
                  </div>
                  <span className="w-20 text-right text-sm text-white/80">
                    ${(p.totalCents / 100).toFixed(2)}
                  </span>
                  <span className="w-16 text-right text-xs text-white/40">
                    {p.calls} calls
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Daily cost chart */}
      <ChartCard title="Daily AI Cost">
        {data.byDay.length === 0 ? (
          <p className="text-sm text-white/40 py-12 text-center">
            Not enough data
          </p>
        ) : (
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data.byDay}>
                <XAxis
                  dataKey="date"
                  tick={{ fill: "rgba(255,255,255,0.55)", fontSize: 12 }}
                  tickFormatter={(v) => v.slice(5)}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: "rgba(255,255,255,0.55)", fontSize: 12 }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) => `$${(v / 100).toFixed(0)}`}
                />
                <Tooltip
                  formatter={(value) =>
                    `$${(Number(value) / 100).toFixed(2)}`
                  }
                  contentStyle={{
                    background: "#13131F",
                    border: "1px solid rgba(255,255,255,0.1)",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="totalCents"
                  stroke="#7C5CFC"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </ChartCard>

      {/* Recent calls table */}
      <div className="rounded-xl bg-[#13131F] p-5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-medium text-white/60">
            Recent Claude Calls
          </h3>
          <select
            value={filterPurpose}
            onChange={(e) => setFilterPurpose(e.target.value)}
            className="rounded-md bg-[#0A0A0F] px-3 py-1 text-xs text-white/70"
          >
            <option value="">All purposes</option>
            {purposes.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>
        <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 bg-[#13131F]">
              <tr className="border-b border-white/10 text-white/40">
                <th className="pb-2 pr-3 font-medium">Purpose</th>
                <th className="pb-2 pr-3 font-medium">Model</th>
                <th className="pb-2 pr-3 font-medium text-right">In</th>
                <th className="pb-2 pr-3 font-medium text-right">Out</th>
                <th className="pb-2 pr-3 font-medium text-right">Cost</th>
                <th className="pb-2 pr-3 font-medium text-right">ms</th>
                <th className="pb-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr
                  key={c.id}
                  className="border-b border-white/5 text-white/60"
                >
                  <td className="py-1.5 pr-3 max-w-[120px] truncate">
                    {c.purpose}
                  </td>
                  <td className="py-1.5 pr-3 text-white/40">{c.model}</td>
                  <td className="py-1.5 pr-3 text-right">
                    {c.tokensIn.toLocaleString()}
                  </td>
                  <td className="py-1.5 pr-3 text-right">
                    {c.tokensOut.toLocaleString()}
                  </td>
                  <td className="py-1.5 pr-3 text-right">
                    ${(c.costCents / 100).toFixed(3)}
                  </td>
                  <td className="py-1.5 pr-3 text-right">
                    {c.durationMs.toLocaleString()}
                  </td>
                  <td className="py-1.5">
                    {c.success ? (
                      <span className="text-green-400">OK</span>
                    ) : (
                      <span className="text-red-400" title={c.errorMessage ?? ""}>
                        FAIL
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showBreakdown && (
        <DrilldownModal
          metric="ai_spend_breakdown"
          start={start}
          end={end}
          fallbackTitle="Claude Spend by Feature"
          onClose={() => setShowBreakdown(false)}
        />
      )}
    </div>
  );
}
