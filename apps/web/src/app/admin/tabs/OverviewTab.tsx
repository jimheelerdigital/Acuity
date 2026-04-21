"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import MetricCard from "../components/MetricCard";
import ChartCard from "../components/ChartCard";
import RefreshButton from "../components/RefreshButton";
import RecentAdminActions from "../components/RecentAdminActions";
import { SkeletonMetric, SkeletonChart } from "../components/SkeletonCard";
import { useTabData } from "./useTabData";

interface OverviewData {
  signups: number;
  prevSignups: number;
  payingSubs: number;
  prevPayingSubs: number;
  conversionRate: number;
  prevConversionRate: number;
  aiSpendCents: number;
  signupsOverTime: { date: string; count: number }[];
  aiByPurpose: { purpose: string; total: number }[];
  redFlags: { id: string; severity: string; title: string; category: string }[];
}

const SEVERITY_COLORS: Record<string, string> = {
  CRITICAL: "border-red-500/40 bg-red-900/20 text-red-300",
  WARNING: "border-amber-500/40 bg-amber-900/20 text-amber-300",
  INFO: "border-blue-500/40 bg-blue-900/20 text-blue-300",
};

const PIE_COLORS = ["#7C5CFC", "#9B7DFF", "#D4A843", "#4EBAAA", "#E06C75", "#56B6C2", "#98C379"];

export default function OverviewTab({
  start,
  end,
}: {
  start: string;
  end: string;
}) {
  const { data, loading, meta, refresh } = useTabData<OverviewData>("overview", start, end);

  if (loading || !data) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonMetric key={i} />
          ))}
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <SkeletonChart />
          <SkeletonChart />
        </div>
      </div>
    );
  }

  const aiDollars = (data.aiSpendCents / 100).toFixed(2);
  const signupSparkline = data.signupsOverTime.map((d) => ({ v: d.count }));

  return (
    <div className="space-y-6">
      {/* Refresh */}
      <div className="flex justify-end">
        <RefreshButton computedAt={meta?.computedAt ?? null} onRefresh={refresh} loading={loading} />
      </div>

      {/* Hero metrics */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
        <MetricCard
          label="New Signups"
          value={data.signups}
          currentValue={data.signups}
          previousValue={data.prevSignups}
          sparklineData={signupSparkline}
        />
        <MetricCard
          label="Trial-to-Paid Conversion Rate"
          value={`${data.conversionRate}%`}
          currentValue={data.conversionRate}
          previousValue={data.prevConversionRate}
        />
        <MetricCard
          label="Active Paying Subscribers"
          value={data.payingSubs}
          currentValue={data.payingSubs}
          previousValue={data.prevPayingSubs}
        />
        <MetricCard
          label="Monthly Recurring Revenue (MRR)"
          value={`$${((data.payingSubs * 999) / 100).toFixed(0)}`}
        />
        <MetricCard
          label="Blended Customer Acquisition Cost (CAC)"
          value="—"
        />
        <MetricCard
          label="Claude Spend (Month-to-Date)"
          value={`$${aiDollars}`}
          budgetBar={{ current: data.aiSpendCents, max: 10000 }}
        />
      </div>

      {/* Charts row */}
      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Signups Over Time">
          {data.signupsOverTime.length === 0 ? (
            <p className="text-sm text-white/40 py-12 text-center">
              Not enough data — comes online after first signups
            </p>
          ) : (
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.signupsOverTime}>
                  <XAxis
                    dataKey="date"
                    tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 10 }}
                    tickFormatter={(v) => v.slice(5)}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                    allowDecimals={false}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "#13131F",
                      border: "1px solid rgba(255,255,255,0.1)",
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                    labelStyle={{ color: "rgba(255,255,255,0.5)" }}
                  />
                  <Bar dataKey="count" fill="#7C5CFC" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </ChartCard>

        <ChartCard title="AI Cost by Feature (Month-to-Date)">
          {data.aiByPurpose.length === 0 ? (
            <p className="text-sm text-white/40 py-12 text-center">
              Not enough data — comes online after AI calls are logged
            </p>
          ) : (
            <div className="h-56 flex items-center justify-center">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={data.aiByPurpose.map((d) => ({
                      name: d.purpose,
                      value: d.total,
                    }))}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    dataKey="value"
                    label={false}
                    labelLine={false}
                  >
                    {data.aiByPurpose.map((_, i) => (
                      <Cell
                        key={i}
                        fill={PIE_COLORS[i % PIE_COLORS.length]}
                      />
                    ))}
                  </Pie>
                  <Legend
                    wrapperStyle={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}
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
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </ChartCard>
      </div>

      {/* Recent admin actions (AdminAuditLog) */}
      <RecentAdminActions />

      {/* Red flags summary */}
      {data.redFlags.length > 0 && (
        <div className="rounded-xl bg-[#13131F] p-5">
          <h3 className="mb-3 text-sm font-medium text-white/60">
            Active Red Flags
          </h3>
          <div className="space-y-2">
            {data.redFlags.map((f) => (
              <div
                key={f.id}
                className={`rounded-lg border px-4 py-2 text-sm ${SEVERITY_COLORS[f.severity] ?? SEVERITY_COLORS.INFO}`}
              >
                <span className="font-medium">{f.title}</span>
                <span className="ml-2 text-xs opacity-60">{f.category}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
