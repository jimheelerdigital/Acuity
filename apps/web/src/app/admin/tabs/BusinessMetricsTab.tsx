"use client";

import {
  AreaChart,
  Area,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import MetricCard from "../components/MetricCard";
import ChartCard from "../components/ChartCard";
import RefreshButton from "../components/RefreshButton";
import { SkeletonMetric, SkeletonChart, SkeletonTable } from "../components/SkeletonCard";
import { TabError } from "../components/TabError";
import { useTabData } from "./useTabData";

/* ── Data shape ────────────────────────────────────────────────────── */

type BusinessMetricsData = {
  // Revenue
  mrrCents: number;
  totalRevenueCents: number;
  revenueThisMonthCents: number;
  arpuCents: number;
  payingUsers: number;
  mrrTrend: { month: string; mrr: number }[];

  // Costs
  aiCostsThisMonthCents: number;
  adSpendThisMonthCents: number;
  infraCosts: { category: string; label: string; amountCents: number }[];
  totalCostsThisMonthCents: number;

  // Unit Economics
  costPerUserCents: number;
  cacCents: number | null;
  grossMarginPerUserCents: number;
  grossMarginPct: number;
  ltvCents: number;
  ltvCacRatio: number | null;
  paybackMonths: number | null;

  // P&L
  netProfitCents: number;
  profitTrend: { month: string; revenue: number; costs: number; net: number }[];
  breakEvenUsers: number;
  runwayMonths: number | null;
};

/* ── Formatting helpers ────────────────────────────────────────────── */

function fmtDollars(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function fmtPct(n: number): string {
  return `${n.toFixed(1)}%`;
}

function fmtWholeDollars(cents: number): string {
  return `$${Math.round(cents / 100).toLocaleString()}`;
}

/* ── Component ─────────────────────────────────────────────────────── */

export default function BusinessMetricsTab({
  start,
  end,
}: {
  start: string;
  end: string;
}) {
  const { data, loading, error, meta, refresh } = useTabData<BusinessMetricsData>(
    "business-metrics",
    start,
    end,
  );

  if (error && !data) {
    return <TabError message={error} onRetry={refresh} />;
  }

  if (loading || !data) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonMetric key={i} />
          ))}
        </div>
        <SkeletonChart />
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <SkeletonMetric key={i} />
          ))}
        </div>
        <SkeletonTable />
        <SkeletonChart />
      </div>
    );
  }

  const infraTotal = data.infraCosts.reduce((sum, c) => sum + c.amountCents, 0);
  const isProfitable = data.netProfitCents >= 0;

  return (
    <div className="space-y-8">
      <div className="flex justify-end">
        <RefreshButton computedAt={meta?.computedAt ?? null} onRefresh={refresh} loading={loading} />
      </div>

      {/* ── 1. Revenue Section ───────────────────────────────────── */}
      <section>
        <h2 className="mb-4 text-sm uppercase tracking-wider text-white/40">
          Revenue
        </h2>

        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <MetricCard label="MRR" value={fmtDollars(data.mrrCents)} />
          <MetricCard label="Total Revenue" value={fmtDollars(data.totalRevenueCents)} />
          <MetricCard label="Revenue This Month" value={fmtDollars(data.revenueThisMonthCents)} />
          <MetricCard label="ARPU" value={fmtDollars(data.arpuCents)} />
        </div>

        <div className="mt-4 rounded-xl bg-[#13131F] px-5 py-3">
          <span className="text-sm text-white/50">Paying users: </span>
          <span className="text-sm font-semibold text-white">
            {data.payingUsers.toLocaleString()}
          </span>
        </div>

        <div className="mt-4">
          <ChartCard title="MRR Trend">
            {data.mrrTrend.length < 2 ? (
              <p className="py-12 text-center text-sm text-white/40">Not enough data</p>
            ) : (
              <div className="h-60">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={data.mrrTrend}>
                    <defs>
                      <linearGradient id="mrrFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#7C5CFC" stopOpacity={0.2} />
                        <stop offset="100%" stopColor="#7C5CFC" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis
                      dataKey="month"
                      tick={{ fill: "rgba(255,255,255,0.55)", fontSize: 12 }}
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
                      formatter={(value: number) => fmtDollars(value)}
                      contentStyle={{
                        background: "#13131F",
                        border: "1px solid rgba(255,255,255,0.1)",
                        borderRadius: 8,
                        fontSize: 12,
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="mrr"
                      stroke="#7C5CFC"
                      fill="url(#mrrFill)"
                      strokeWidth={2}
                      dot={false}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </ChartCard>
        </div>
      </section>

      {/* ── 2. Costs Section ─────────────────────────────────────── */}
      <section>
        <h2 className="mb-4 text-sm uppercase tracking-wider text-white/40">
          Costs
        </h2>

        <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
          <MetricCard label="AI Costs This Month" value={fmtDollars(data.aiCostsThisMonthCents)} />
          <MetricCard label="Ad Spend This Month" value={fmtDollars(data.adSpendThisMonthCents)} />
          <MetricCard label="Total Costs This Month" value={fmtDollars(data.totalCostsThisMonthCents)} />
        </div>

        {/* Infrastructure costs table */}
        <div className="mt-4 rounded-xl bg-[#13131F] p-5">
          <h3 className="mb-3 text-sm font-medium text-white/60">
            Infrastructure Costs
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-white/10 text-white/40">
                  <th className="pb-2 pr-4 font-medium">Category</th>
                  <th className="pb-2 pr-4 font-medium">Label</th>
                  <th className="pb-2 font-medium text-right">Monthly Cost</th>
                </tr>
              </thead>
              <tbody>
                {data.infraCosts.map((row, i) => (
                  <tr key={i} className="border-b border-white/5 text-white/70">
                    <td className="py-2 pr-4">{row.category}</td>
                    <td className="py-2 pr-4">{row.label}</td>
                    <td className="py-2 text-right tabular-nums">{fmtDollars(row.amountCents)}</td>
                  </tr>
                ))}
                <tr className="border-t border-white/20 font-medium text-white">
                  <td className="pt-3 pr-4" colSpan={2}>
                    Total Infrastructure
                  </td>
                  <td className="pt-3 text-right tabular-nums">{fmtDollars(infraTotal)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* ── 3. Unit Economics Section ────────────────────────────── */}
      <section>
        <h2 className="mb-4 text-sm uppercase tracking-wider text-white/40">
          Unit Economics
        </h2>

        <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
          <MiniMetric
            label="Cost per User / Month"
            value={fmtDollars(data.costPerUserCents)}
          />
          <MiniMetric
            label="Customer Acquisition Cost"
            value={data.cacCents !== null ? fmtDollars(data.cacCents) : "N/A"}
            color={data.cacCents === null ? "text-white/30" : undefined}
          />
          <MiniMetric
            label="Gross Margin / User"
            value={fmtDollars(data.grossMarginPerUserCents)}
            color={data.grossMarginPerUserCents >= 0 ? "text-emerald-400" : "text-red-400"}
          />
          <MiniMetric
            label="Gross Margin %"
            value={fmtPct(data.grossMarginPct)}
            color={data.grossMarginPct >= 0 ? "text-emerald-400" : "text-red-400"}
          />
          <MiniMetric
            label="LTV Estimate"
            value={fmtDollars(data.ltvCents)}
          />
          <MiniMetric
            label="LTV : CAC Ratio"
            value={data.ltvCacRatio !== null ? `${data.ltvCacRatio.toFixed(1)}x` : "N/A"}
            color={
              data.ltvCacRatio === null
                ? "text-white/30"
                : data.ltvCacRatio >= 3
                  ? "text-emerald-400"
                  : "text-amber-400"
            }
          />
          <MiniMetric
            label="Months to Payback"
            value={data.paybackMonths !== null ? `${data.paybackMonths.toFixed(1)}` : "N/A"}
            color={data.paybackMonths === null ? "text-white/30" : undefined}
          />
        </div>
      </section>

      {/* ── 4. P&L Section ───────────────────────────────────────── */}
      <section>
        <h2 className="mb-4 text-sm uppercase tracking-wider text-white/40">
          Profit &amp; Loss
        </h2>

        {/* Big net profit number */}
        <div className="rounded-xl bg-[#13131F] p-6 text-center">
          <p className="text-sm text-white/40 mb-2">Net Profit / Loss This Month</p>
          <p
            className={`text-3xl font-bold tabular-nums ${
              isProfitable ? "text-emerald-400" : "text-red-400"
            }`}
          >
            {isProfitable ? "+" : ""}
            {fmtDollars(data.netProfitCents)}
          </p>
        </div>

        {/* Revenue vs Costs vs Net trend */}
        <div className="mt-4">
          <ChartCard title="Revenue vs Costs vs Net">
            {data.profitTrend.length < 2 ? (
              <p className="py-12 text-center text-sm text-white/40">Not enough data</p>
            ) : (
              <div className="h-60">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={data.profitTrend}>
                    <XAxis
                      dataKey="month"
                      tick={{ fill: "rgba(255,255,255,0.55)", fontSize: 12 }}
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
                      formatter={(value: number) => fmtDollars(value)}
                      contentStyle={{
                        background: "#13131F",
                        border: "1px solid rgba(255,255,255,0.1)",
                        borderRadius: 8,
                        fontSize: 12,
                      }}
                    />
                    <Legend
                      wrapperStyle={{ fontSize: 12, color: "rgba(255,255,255,0.6)" }}
                    />
                    <Line
                      type="monotone"
                      dataKey="revenue"
                      name="Revenue"
                      stroke="#34D399"
                      strokeWidth={2}
                      dot={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="costs"
                      name="Costs"
                      stroke="#EF4444"
                      strokeWidth={2}
                      dot={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="net"
                      name="Net"
                      stroke="#7C5CFC"
                      strokeWidth={2}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </ChartCard>
        </div>

        {/* Break-even callout */}
        <div className="mt-4 rounded-xl bg-[#13131F] p-5">
          <p className="text-sm text-white/60">
            <span className="text-white font-medium">Break-even target:</span>{" "}
            Need{" "}
            <span className="text-white font-semibold tabular-nums">
              {data.breakEvenUsers.toLocaleString()}
            </span>{" "}
            paying users to cover monthly costs
          </p>
        </div>

        {/* Runway callout — only shown when costs exceed revenue */}
        {!isProfitable && data.runwayMonths !== null && (
          <div className="mt-4 rounded-xl border border-red-500/20 bg-red-900/10 p-5">
            <p className="text-sm text-red-300/80">
              <span className="text-red-400 font-medium">Runway:</span>{" "}
              At current burn rate, runway is{" "}
              <span className="text-red-300 font-semibold tabular-nums">
                {data.runwayMonths.toFixed(1)}
              </span>{" "}
              months
            </p>
          </div>
        )}
      </section>
    </div>
  );
}

/* ── Helper component ──────────────────────────────────────────────── */

function MiniMetric({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: string;
  sub?: string;
  color?: string;
}) {
  return (
    <div className="rounded-lg bg-white/[0.03] px-4 py-3">
      <div className="text-[11px] uppercase tracking-wider text-white/30 mb-1">
        {label}
      </div>
      <div className={`text-lg font-semibold tabular-nums ${color ?? "text-white"}`}>
        {value}
      </div>
      {sub && (
        <div className="text-[10px] text-white/20 mt-0.5">{sub}</div>
      )}
    </div>
  );
}
