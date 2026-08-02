"use client";

import { useState } from "react";
// Recharts removed — chart uses CSS bars
import MetricCard from "../components/MetricCard";
import ChartCard from "../components/ChartCard";
import RefreshButton from "../components/RefreshButton";
import { DrilldownModal } from "../components/DrilldownModal";
import { SkeletonMetric, SkeletonChart, SkeletonTable } from "../components/SkeletonCard";
import { TabError } from "../components/TabError";
import DataTable, { type Column } from "../components/DataTable";
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

type RecentCall = AICostsData["recentCalls"][number];

const RECENT_CALL_COLUMNS: Column<RecentCall>[] = [
  { key: "purpose", label: "Purpose", value: (c) => c.purpose },
  { key: "model", label: "Model", value: (c) => c.model },
  { key: "tokensIn", label: "In", value: (c) => c.tokensIn, render: (c) => c.tokensIn.toLocaleString(), align: "right", numeric: true },
  { key: "tokensOut", label: "Out", value: (c) => c.tokensOut, render: (c) => c.tokensOut.toLocaleString(), align: "right", numeric: true },
  { key: "cost", label: "Cost", value: (c) => c.costCents, render: (c) => `$${(c.costCents / 100).toFixed(3)}`, align: "right", numeric: true },
  { key: "durationMs", label: "ms", value: (c) => c.durationMs, render: (c) => c.durationMs.toLocaleString(), align: "right", numeric: true },
  {
    key: "status", label: "Status", value: (c) => (c.success ? "OK" : "FAIL"),
    render: (c) => c.success
      ? <span className="text-acuity-good">OK</span>
      : <span className="text-acuity-bad" title={c.errorMessage ?? ""}>FAIL</span>,
  },
  { key: "createdAt", label: "When", value: (c) => c.createdAt, render: (c) => new Date(c.createdAt).toLocaleString(), numeric: true },
];

const PER_USER_COLUMNS: Column<PerUserCost>[] = [
  {
    key: "email", label: "Email", value: (u) => u.email,
    render: (u) => (
      <span className={u.totalCostCents > 500 ? "text-acuity-bad" : undefined}>{u.email}</span>
    ),
  },
  { key: "totalCost", label: "Total Cost", value: (u) => u.totalCostCents, render: (u) => `$${(u.totalCostCents / 100).toFixed(2)}`, align: "right", numeric: true },
  { key: "calls", label: "Calls", value: (u) => u.callCount, align: "right", numeric: true },
  { key: "avgCall", label: "Avg / Call", value: (u) => u.totalCostCents / Math.max(u.callCount, 1), render: (u) => `$${(u.totalCostCents / Math.max(u.callCount, 1) / 100).toFixed(3)}`, align: "right", numeric: true },
];

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
      <div className="rounded-acuity-lg border border-acuity-card-border bg-acuity-card-bg shadow-acuity-soft p-5">
        <h3 className="mb-3 text-sm font-medium text-acuity-text-ter">
          Spend by Feature
        </h3>
        {data.byPurpose.length === 0 ? (
          <p className="text-sm text-acuity-text-quiet py-6 text-center">
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
                  <span className="w-36 shrink-0 truncate text-sm text-acuity-text-sec">
                    {p.purpose}
                  </span>
                  <div className="relative h-6 flex-1 overflow-hidden rounded bg-acuity-bg-inset">
                    <div
                      className="h-full rounded bg-acuity-primary"
                      style={{
                        width: `${(p.totalCents / maxCents) * 100}%`,
                      }}
                    />
                  </div>
                  <span className="w-20 text-right text-sm text-acuity-text-sec">
                    ${(p.totalCents / 100).toFixed(2)}
                  </span>
                  <span className="w-16 text-right text-xs text-acuity-text-ter">
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
          <p className="text-sm text-acuity-text-ter py-12 text-center">
            Not enough data
          </p>
        ) : (() => {
          const max = Math.max(...data.byDay.map((d: { totalCents: number }) => d.totalCents), 1);
          return (
            <div className="flex items-end gap-1 h-48 pt-4">
              {data.byDay.map((d: { date: string; totalCents: number }, i: number) => (
                <div key={i} className="flex-1 flex flex-col items-center justify-end" title={`${d.date}: $${(d.totalCents / 100).toFixed(2)}`}>
                  <div className="w-full rounded-t bg-acuity-primary" style={{ height: `${Math.max(2, (d.totalCents / max) * 100)}%` }} />
                </div>
              ))}
            </div>
          );
        })()}
      </ChartCard>

      {/* Recent calls table */}
      <div className="rounded-acuity-lg border border-acuity-card-border bg-acuity-card-bg shadow-acuity-soft p-5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-medium text-acuity-text-ter">
            Recent Claude Calls
          </h3>
          <select
            value={filterPurpose}
            onChange={(e) => setFilterPurpose(e.target.value)}
            className="rounded-md bg-acuity-bg px-3 py-1 text-xs text-acuity-text-sec"
          >
            <option value="">All purposes</option>
            {purposes.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>
        <DataTable
          columns={RECENT_CALL_COLUMNS}
          rows={filtered}
          rowKey={(c) => c.id}
          initialSort={{ key: "createdAt", dir: "desc" }}
          maxHeight={400}
          emptyMessage="No Claude calls logged"
        />
      </div>

      {/* Per-user cost breakdown */}
      {data.perUserCosts && data.perUserCosts.length > 0 && (
        <div className="rounded-acuity-lg border border-acuity-card-border bg-acuity-card-bg shadow-acuity-soft p-5">
          <h3 className="mb-1 text-sm font-semibold uppercase tracking-wider text-acuity-text-ter">
            Per-User Costs (Month-to-Date)
          </h3>
          <p className="mb-4 text-[11px] text-acuity-text-quiet">
            Based on Claude calls with user attribution. Sorted by highest cost.
          </p>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 mb-4">
            <div className="rounded-lg bg-acuity-bg-inset px-4 py-3">
              <div className="text-[11px] uppercase tracking-wider text-acuity-text-quiet mb-1">Avg User Cost</div>
              <div className="text-lg font-semibold text-acuity-text">
                ${(data.perUserCosts.reduce((s, u) => s + u.totalCostCents, 0) / data.perUserCosts.length / 100).toFixed(2)}
              </div>
            </div>
            <div className="rounded-lg bg-acuity-bg-inset px-4 py-3">
              <div className="text-[11px] uppercase tracking-wider text-acuity-text-quiet mb-1">Heaviest User</div>
              <div className="text-lg font-semibold text-acuity-text">
                ${(data.perUserCosts[0].totalCostCents / 100).toFixed(2)}
              </div>
              <div className="text-[10px] text-acuity-text-quiet">{data.perUserCosts[0].email}</div>
            </div>
            <div className="rounded-lg bg-acuity-bg-inset px-4 py-3">
              <div className="text-[11px] uppercase tracking-wider text-acuity-text-quiet mb-1">Gross Margin / User</div>
              <div className={`text-lg font-semibold ${1299 - (data.perUserCosts.reduce((s, u) => s + u.totalCostCents, 0) / data.perUserCosts.length) > 0 ? "text-acuity-good" : "text-acuity-bad"}`}>
                ${((1299 - data.perUserCosts.reduce((s, u) => s + u.totalCostCents, 0) / data.perUserCosts.length) / 100).toFixed(2)}
              </div>
            </div>
          </div>
          <DataTable
            columns={PER_USER_COLUMNS}
            rows={data.perUserCosts}
            rowKey={(u) => u.userId}
            searchable
            searchPlaceholder="Search email…"
            initialSort={{ key: "totalCost", dir: "desc" }}
            maxHeight={300}
          />
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
