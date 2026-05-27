"use client";

import {
  BarChart,
  Bar,
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { SafeChart } from "../components/SafeChart";
import MetricCard from "../components/MetricCard";
import ChartCard from "../components/ChartCard";
import RefreshButton from "../components/RefreshButton";
import {
  SkeletonMetric,
  SkeletonChart,
  SkeletonTable,
} from "../components/SkeletonCard";
import { TabError } from "../components/TabError";
import { useTabData } from "./useTabData";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type GrowthMetricsData = {
  weeklySignups: { week: string; count: number }[];
  cumulativeUsers: { week: string; total: number }[];
  signupsBySource: {
    week: string;
    direct: number;
    meta: number;
    organic: number;
    referral: number;
  }[];

  cohorts: {
    cohortWeek: string;
    signups: number;
    retention: {
      week1: number;
      week2: number;
      week3: number;
      week4: number;
      week8: number;
      week12: number;
    };
  }[];

  weeklyRecordings: { week: string; count: number }[];
  avgRecordingsPerUser: { week: string; avg: number }[];
  avgDuration: { week: string; seconds: number }[];

  trialToPaidRate: { week: string; rate: number }[];
  medianTimeToFirstRecording: { week: string; hours: number }[];

  mrrOverTime: { month: string; mrr: number }[];
  payingUsersOverTime: { month: string; count: number }[];

  projections: {
    current: number;
    growth100: string;
    growth500: string;
    growth1000: string;
  } | null;
};

/* ------------------------------------------------------------------ */
/*  Format helpers                                                     */
/* ------------------------------------------------------------------ */

function fmtWeek(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function fmtPct(n: number | null | undefined): string {
  if (n == null) return "—";
  return `${n.toFixed(1)}%`;
}

function fmtDollars(cents: number): string {
  return `$${(cents / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function fmtDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}m ${s}s`;
}

function fmtMonth(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
}

/* ------------------------------------------------------------------ */
/*  Shared chart styling                                               */
/* ------------------------------------------------------------------ */

const AXIS_TICK = { fill: "rgba(255,255,255,0.55)", fontSize: 12 };
const GRID_STROKE = "rgba(255,255,255,0.06)";

const TOOLTIP_STYLE = {
  background: "#13131F",
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 8,
  fontSize: 12,
};

const SOURCE_COLORS = {
  direct: "#7C5CFC",
  meta: "#22D3EE",
  organic: "#34D399",
  referral: "#FBBF24",
};

/* ------------------------------------------------------------------ */
/*  Retention cell color                                               */
/* ------------------------------------------------------------------ */

function retentionColor(pct: number | null | undefined): string {
  if (pct == null) return "";
  if (pct >= 50) return "bg-green-500/20 text-green-400";
  if (pct >= 25) return "bg-yellow-500/20 text-yellow-400";
  return "bg-red-500/20 text-red-400";
}

/* ------------------------------------------------------------------ */
/*  Section header                                                     */
/* ------------------------------------------------------------------ */

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-sm uppercase tracking-wider text-white/40 mt-10 mb-4 first:mt-0">
      {children}
    </h2>
  );
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function GrowthMetricsTab({
  start,
  end,
}: {
  start: string;
  end: string;
}) {
  const { data, loading, error, meta, refresh } =
    useTabData<GrowthMetricsData>("growth-metrics", start, end);

  /* ---- Error state ---- */
  if (error && !data) {
    return <TabError message={error} onRetry={refresh} />;
  }

  /* ---- Loading state ---- */
  if (loading || !data) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonMetric key={i} />
          ))}
        </div>
        <SkeletonChart />
        <SkeletonTable />
        <SkeletonChart />
        <SkeletonChart />
        <SkeletonChart />
      </div>
    );
  }

  /* ---- Derived values ---- */
  const latestMrr = data.mrrOverTime.at(-1);
  const latestPaying = data.payingUsersOverTime.at(-1);
  const totalSignups = data.weeklySignups.reduce((s, w) => s + w.count, 0);
  const latestTrialRate = data.trialToPaidRate.at(-1);

  return (
    <div className="space-y-6">
      {/* Refresh button */}
      <div className="flex justify-end">
        <RefreshButton
          computedAt={meta?.computedAt ?? null}
          onRefresh={refresh}
          loading={loading}
        />
      </div>

      {/* Top-level summary cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <MetricCard
          label="Total Signups (period)"
          value={totalSignups}
        />
        <MetricCard
          label="Current Users"
          value={data.projections?.current ?? "—"}
        />
        <MetricCard
          label="MRR"
          value={latestMrr ? fmtDollars(latestMrr.mrr) : "—"}
        />
        <MetricCard
          label="Trial → Paid"
          value={latestTrialRate ? fmtPct(latestTrialRate.rate) : "—"}
        />
      </div>

      {/* ============================================================ */}
      {/*  1. User Growth                                              */}
      {/* ============================================================ */}
      <SectionHeader>User Growth</SectionHeader>

      {/* Weekly signups bar chart */}
      <ChartCard title="Weekly Signups">
        <SafeChart height={240}><ResponsiveContainer width="100%" height={240}>
          <BarChart data={data.weeklySignups}>
            <CartesianGrid stroke={GRID_STROKE} vertical={false} />
            <XAxis
              dataKey="week"
              tick={AXIS_TICK}
              tickFormatter={fmtWeek}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={AXIS_TICK}
              axisLine={false}
              tickLine={false}
              allowDecimals={false}
            />
            <Tooltip
              contentStyle={TOOLTIP_STYLE}
              labelFormatter={fmtWeek}
            />
            <Bar dataKey="count" fill="#7C5CFC" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer></SafeChart>
      </ChartCard>

      {/* Cumulative users line chart */}
      <ChartCard title="Cumulative Users">
        <SafeChart height={240}><ResponsiveContainer width="100%" height={240}>
          <LineChart data={data.cumulativeUsers}>
            <CartesianGrid stroke={GRID_STROKE} vertical={false} />
            <XAxis
              dataKey="week"
              tick={AXIS_TICK}
              tickFormatter={fmtWeek}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={AXIS_TICK}
              axisLine={false}
              tickLine={false}
              allowDecimals={false}
            />
            <Tooltip
              contentStyle={TOOLTIP_STYLE}
              labelFormatter={fmtWeek}
            />
            <Line
              type="monotone"
              dataKey="total"
              stroke="#A78BFA"
              strokeWidth={2}
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer></SafeChart>
      </ChartCard>

      {/* Signups by source stacked area */}
      <ChartCard title="Signups by Source">
        <SafeChart height={240}><ResponsiveContainer width="100%" height={240}>
          <AreaChart data={data.signupsBySource}>
            <CartesianGrid stroke={GRID_STROKE} vertical={false} />
            <XAxis
              dataKey="week"
              tick={AXIS_TICK}
              tickFormatter={fmtWeek}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={AXIS_TICK}
              axisLine={false}
              tickLine={false}
              allowDecimals={false}
            />
            <Tooltip
              contentStyle={TOOLTIP_STYLE}
              labelFormatter={fmtWeek}
            />
            <Legend
              wrapperStyle={{ fontSize: 12, color: "rgba(255,255,255,0.6)" }}
            />
            <Area
              type="monotone"
              dataKey="direct"
              stackId="src"
              stroke={SOURCE_COLORS.direct}
              fill={SOURCE_COLORS.direct}
              fillOpacity={0.3}
            />
            <Area
              type="monotone"
              dataKey="meta"
              stackId="src"
              stroke={SOURCE_COLORS.meta}
              fill={SOURCE_COLORS.meta}
              fillOpacity={0.3}
            />
            <Area
              type="monotone"
              dataKey="organic"
              stackId="src"
              stroke={SOURCE_COLORS.organic}
              fill={SOURCE_COLORS.organic}
              fillOpacity={0.3}
            />
            <Area
              type="monotone"
              dataKey="referral"
              stackId="src"
              stroke={SOURCE_COLORS.referral}
              fill={SOURCE_COLORS.referral}
              fillOpacity={0.3}
            />
          </AreaChart>
        </ResponsiveContainer></SafeChart>
      </ChartCard>

      {/* Projections callout */}
      {data.projections && (
        <div className="rounded-xl bg-[#13131F] border border-white/5 p-5">
          <h3 className="text-sm font-medium text-white/60 mb-2">
            Growth Projections
          </h3>
          <p className="text-sm text-white/80 leading-relaxed">
            Currently at{" "}
            <span className="font-semibold text-white">
              {data.projections.current} users
            </span>
            . At current growth:{" "}
            <span className="text-[#A78BFA] font-medium">100 users</span> by{" "}
            {fmtWeek(data.projections.growth100)},{" "}
            <span className="text-[#A78BFA] font-medium">500</span> by{" "}
            {fmtWeek(data.projections.growth500)},{" "}
            <span className="text-[#A78BFA] font-medium">1,000</span> by{" "}
            {fmtWeek(data.projections.growth1000)}.
          </p>
        </div>
      )}

      {/* ============================================================ */}
      {/*  2. Retention Cohort Table                                    */}
      {/* ============================================================ */}
      <SectionHeader>Retention Cohorts</SectionHeader>

      <div className="rounded-xl bg-[#13131F] p-5 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-white/10 text-white/40">
              <th className="pb-2 pr-4 font-medium">Cohort</th>
              <th className="pb-2 pr-4 font-medium text-right">Signups</th>
              <th className="pb-2 pr-4 font-medium text-right">Wk 1</th>
              <th className="pb-2 pr-4 font-medium text-right">Wk 2</th>
              <th className="pb-2 pr-4 font-medium text-right">Wk 3</th>
              <th className="pb-2 pr-4 font-medium text-right">Wk 4</th>
              <th className="pb-2 pr-4 font-medium text-right">Wk 8</th>
              <th className="pb-2 font-medium text-right">Wk 12</th>
            </tr>
          </thead>
          <tbody>
            {data.cohorts.map((c) => {
              const weeks = [
                c.retention.week1,
                c.retention.week2,
                c.retention.week3,
                c.retention.week4,
                c.retention.week8,
                c.retention.week12,
              ];
              return (
                <tr
                  key={c.cohortWeek}
                  className="border-b border-white/5 text-white/70"
                >
                  <td className="py-2 pr-4 whitespace-nowrap">
                    {fmtWeek(c.cohortWeek)}
                  </td>
                  <td className="py-2 pr-4 text-right">{c.signups}</td>
                  {weeks.map((pct, i) => (
                    <td key={i} className="py-2 pr-4 text-right last:pr-0">
                      {pct == null ? (
                        <span className="text-white/20">—</span>
                      ) : (
                        <span
                          className={`inline-block rounded px-1.5 py-0.5 text-xs font-medium ${retentionColor(pct)}`}
                        >
                          {fmtPct(pct)}
                        </span>
                      )}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ============================================================ */}
      {/*  3. Engagement Trends                                        */}
      {/* ============================================================ */}
      <SectionHeader>Engagement Trends</SectionHeader>

      <ChartCard title="Weekly Recordings">
        <SafeChart height={240}><ResponsiveContainer width="100%" height={240}>
          <BarChart data={data.weeklyRecordings}>
            <CartesianGrid stroke={GRID_STROKE} vertical={false} />
            <XAxis
              dataKey="week"
              tick={AXIS_TICK}
              tickFormatter={fmtWeek}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={AXIS_TICK}
              axisLine={false}
              tickLine={false}
              allowDecimals={false}
            />
            <Tooltip
              contentStyle={TOOLTIP_STYLE}
              labelFormatter={fmtWeek}
            />
            <Bar dataKey="count" fill="#7C5CFC" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer></SafeChart>
      </ChartCard>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard title="Avg Recordings / User">
          <SafeChart height={240}><ResponsiveContainer width="100%" height={240}>
            <LineChart data={data.avgRecordingsPerUser}>
              <CartesianGrid stroke={GRID_STROKE} vertical={false} />
              <XAxis
                dataKey="week"
                tick={AXIS_TICK}
                tickFormatter={fmtWeek}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={AXIS_TICK}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                labelFormatter={fmtWeek}
                formatter={(v: number) => [v.toFixed(1), "Avg"]}
              />
              <Line
                type="monotone"
                dataKey="avg"
                stroke="#A78BFA"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer></SafeChart>
        </ChartCard>

        <ChartCard title="Avg Recording Duration">
          <SafeChart height={240}><ResponsiveContainer width="100%" height={240}>
            <LineChart data={data.avgDuration}>
              <CartesianGrid stroke={GRID_STROKE} vertical={false} />
              <XAxis
                dataKey="week"
                tick={AXIS_TICK}
                tickFormatter={fmtWeek}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={AXIS_TICK}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v: number) => fmtDuration(v)}
              />
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                labelFormatter={fmtWeek}
                formatter={(v: number) => [fmtDuration(v), "Duration"]}
              />
              <Line
                type="monotone"
                dataKey="seconds"
                stroke="#22D3EE"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer></SafeChart>
        </ChartCard>
      </div>

      {/* ============================================================ */}
      {/*  4. Conversion Trends                                        */}
      {/* ============================================================ */}
      <SectionHeader>Conversion Trends</SectionHeader>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard title="Trial → Paid Rate">
          <SafeChart height={240}><ResponsiveContainer width="100%" height={240}>
            <LineChart data={data.trialToPaidRate}>
              <CartesianGrid stroke={GRID_STROKE} vertical={false} />
              <XAxis
                dataKey="week"
                tick={AXIS_TICK}
                tickFormatter={fmtWeek}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={AXIS_TICK}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v: number) => `${v}%`}
              />
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                labelFormatter={fmtWeek}
                formatter={(v: number) => [fmtPct(v), "Rate"]}
              />
              <Line
                type="monotone"
                dataKey="rate"
                stroke="#34D399"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer></SafeChart>
        </ChartCard>

        <ChartCard title="Median Time to First Recording">
          <SafeChart height={240}><ResponsiveContainer width="100%" height={240}>
            <LineChart data={data.medianTimeToFirstRecording}>
              <CartesianGrid stroke={GRID_STROKE} vertical={false} />
              <XAxis
                dataKey="week"
                tick={AXIS_TICK}
                tickFormatter={fmtWeek}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={AXIS_TICK}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v: number) => `${v}h`}
              />
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                labelFormatter={fmtWeek}
                formatter={(v: number) => [`${v.toFixed(1)}h`, "Median"]}
              />
              <Line
                type="monotone"
                dataKey="hours"
                stroke="#FBBF24"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer></SafeChart>
        </ChartCard>
      </div>

      {/* ============================================================ */}
      {/*  5. Revenue Growth                                           */}
      {/* ============================================================ */}
      <SectionHeader>Revenue Growth</SectionHeader>

      <ChartCard title="MRR Over Time">
        <SafeChart height={240}><ResponsiveContainer width="100%" height={240}>
          <AreaChart data={data.mrrOverTime}>
            <CartesianGrid stroke={GRID_STROKE} vertical={false} />
            <XAxis
              dataKey="month"
              tick={AXIS_TICK}
              tickFormatter={fmtMonth}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={AXIS_TICK}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v: number) => fmtDollars(v)}
            />
            <Tooltip
              contentStyle={TOOLTIP_STYLE}
              labelFormatter={fmtMonth}
              formatter={(v: number) => [fmtDollars(v), "MRR"]}
            />
            <Area
              type="monotone"
              dataKey="mrr"
              stroke="#7C5CFC"
              strokeWidth={2}
              fill="#7C5CFC"
              fillOpacity={0.2}
            />
          </AreaChart>
        </ResponsiveContainer></SafeChart>
      </ChartCard>

      <ChartCard title="Paying Users Over Time">
        <SafeChart height={240}><ResponsiveContainer width="100%" height={240}>
          <BarChart data={data.payingUsersOverTime}>
            <CartesianGrid stroke={GRID_STROKE} vertical={false} />
            <XAxis
              dataKey="month"
              tick={AXIS_TICK}
              tickFormatter={fmtMonth}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={AXIS_TICK}
              axisLine={false}
              tickLine={false}
              allowDecimals={false}
            />
            <Tooltip
              contentStyle={TOOLTIP_STYLE}
              labelFormatter={fmtMonth}
            />
            <Bar dataKey="count" fill="#A78BFA" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer></SafeChart>
      </ChartCard>
    </div>
  );
}
