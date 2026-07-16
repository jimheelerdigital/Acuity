"use client";

import { useState } from "react";
// Recharts removed — chart uses CSS bars
import MetricCard from "../components/MetricCard";
import ChartCard from "../components/ChartCard";
import RefreshButton from "../components/RefreshButton";
import { DrilldownModal } from "../components/DrilldownModal";
import { SkeletonMetric, SkeletonChart, SkeletonTable } from "../components/SkeletonCard";
import { TabError } from "../components/TabError";
import { useTabData } from "./useTabData";

interface PerUserCost {
  userId: string;
  email: string;
  totalCostCents: number;
  callCount: number;
}

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
  perUserCosts?: PerUserCost[];
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
                      className="h-full rounded bg-[#8E6FE6]"
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
        ) : (() => {
          const max = Math.max(...data.byDay.map((d: { totalCents: number }) => d.totalCents), 1);
          return (
            <div className="flex items-end gap-1 h-48 pt-4">
              {data.byDay.map((d: { date: string; totalCents: number }, i: number) => (
                <div key={i} className="flex-1 flex flex-col items-center justify-end" title={`${d.date}: $${(d.totalCents / 100).toFixed(2)}`}>
                  <div className="w-full rounded-t bg-[#8E6FE6]" style={{ height: `${Math.max(2, (d.totalCents / max) * 100)}%` }} />
                </div>
              ))}
            </div>
          );
        })()}
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

      {/* Per-user cost breakdown */}
      {data.perUserCosts && data.perUserCosts.length > 0 && (
        <div className="rounded-xl bg-[#13131F] p-5">
          <h3 className="mb-1 text-sm font-semibold uppercase tracking-wider text-white/40">
            Per-User Costs (Month-to-Date)
          </h3>
          <p className="mb-4 text-[11px] text-white/30">
            Based on Claude calls with user attribution. Sorted by highest cost.
          </p>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 mb-4">
            <div className="rounded-lg bg-white/[0.03] px-4 py-3">
              <div className="text-[11px] uppercase tracking-wider text-white/30 mb-1">Avg User Cost</div>
              <div className="text-lg font-semibold text-white">
                ${(data.perUserCosts.reduce((s, u) => s + u.totalCostCents, 0) / data.perUserCosts.length / 100).toFixed(2)}
              </div>
            </div>
            <div className="rounded-lg bg-white/[0.03] px-4 py-3">
              <div className="text-[11px] uppercase tracking-wider text-white/30 mb-1">Heaviest User</div>
              <div className="text-lg font-semibold text-white">
                ${(data.perUserCosts[0].totalCostCents / 100).toFixed(2)}
              </div>
              <div className="text-[10px] text-white/20">{data.perUserCosts[0].email}</div>
            </div>
            <div className="rounded-lg bg-white/[0.03] px-4 py-3">
              <div className="text-[11px] uppercase tracking-wider text-white/30 mb-1">Gross Margin / User</div>
              <div className={`text-lg font-semibold ${1299 - (data.perUserCosts.reduce((s, u) => s + u.totalCostCents, 0) / data.perUserCosts.length) > 0 ? "text-emerald-400" : "text-red-400"}`}>
                ${((1299 - data.perUserCosts.reduce((s, u) => s + u.totalCostCents, 0) / data.perUserCosts.length) / 100).toFixed(2)}
              </div>
            </div>
          </div>
          <div className="overflow-x-auto max-h-[300px] overflow-y-auto">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 bg-[#13131F]">
                <tr className="border-b border-white/10 text-white/40">
                  <th className="pb-2 pr-3 font-medium">Email</th>
                  <th className="pb-2 pr-3 font-medium text-right">Total Cost</th>
                  <th className="pb-2 pr-3 font-medium text-right">Calls</th>
                  <th className="pb-2 font-medium text-right">Avg / Call</th>
                </tr>
              </thead>
              <tbody>
                {data.perUserCosts.map((u) => (
                  <tr key={u.userId} className={`border-b border-white/5 ${u.totalCostCents > 500 ? "text-red-300" : "text-white/60"}`}>
                    <td className="py-1.5 pr-3">{u.email}</td>
                    <td className="py-1.5 pr-3 text-right">${(u.totalCostCents / 100).toFixed(2)}</td>
                    <td className="py-1.5 pr-3 text-right">{u.callCount}</td>
                    <td className="py-1.5 text-right">${(u.totalCostCents / Math.max(u.callCount, 1) / 100).toFixed(3)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

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
