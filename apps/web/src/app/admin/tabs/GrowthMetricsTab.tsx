"use client";

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

  platformAcquisition: {
    source: string;
    platform: string;
    signups: number;
    activated: number;
    activationPct: number;
    openedNoRecord: number;
    neverOpened: number;
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
/*  CSS Bar Chart — generic reusable bar renderer                      */
/* ------------------------------------------------------------------ */

const SOURCE_COLORS: Record<string, string> = {
  direct: "#7C5CFC",
  meta: "#22D3EE",
  organic: "#34D399",
  referral: "#FBBF24",
};

function BarChart({ data, labelKey, valueKey, color = "#7C5CFC", formatLabel, formatValue }: {
  data?: Record<string, unknown>[] | null;
  labelKey: string;
  valueKey: string;
  color?: string;
  formatLabel?: (v: string) => string;
  formatValue?: (v: number) => string;
}) {
  // Guard against a missing/undefined data field (e.g. a metric the API
  // doesn't return) — render "Not enough data" instead of crashing the tab.
  if (!data || data.length === 0) return <p className="text-sm text-white/30 py-12 text-center">Not enough data</p>;
  const max = Math.max(...data.map((d) => Number(d[valueKey]) || 0), 1);
  return (
    <div className="flex items-end gap-1 h-48 pt-4">
      {data.map((d, i) => {
        const val = Number(d[valueKey]) || 0;
        const label = String(d[labelKey]);
        const fmtVal = formatValue ? formatValue(val) : String(val);
        const fmtLbl = formatLabel ? formatLabel(label) : label.slice(5);
        return (
          <div key={i} className="flex-1 flex flex-col items-center justify-end" title={`${fmtLbl}: ${fmtVal}`}>
            <div className="w-full rounded-t" style={{ background: color, height: `${Math.max(2, (val / max) * 100)}%` }} />
            {data.length <= 14 && (
              <span className="text-[8px] text-white/30 mt-1 tabular-nums">{fmtLbl}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

function StackedBarChart({ data }: { data?: GrowthMetricsData["signupsBySource"] | null }) {
  if (!data || data.length === 0) return <p className="text-sm text-white/30 py-12 text-center">Not enough data</p>;
  const max = Math.max(...data.map((d) => d.direct + d.meta + d.organic + d.referral), 1);
  return (
    <div>
      <div className="flex items-end gap-1 h-48 pt-4">
        {data.map((d, i) => {
          const total = d.direct + d.meta + d.organic + d.referral;
          const h = Math.max(2, (total / max) * 100);
          return (
            <div key={i} className="flex-1 flex flex-col justify-end" style={{ height: "100%" }} title={`${fmtWeek(d.week)}: ${total} (D:${d.direct} M:${d.meta} O:${d.organic} R:${d.referral})`}>
              <div className="w-full rounded-t overflow-hidden flex flex-col-reverse" style={{ height: `${h}%` }}>
                {d.direct > 0 && <div style={{ height: `${(d.direct / total) * 100}%`, background: SOURCE_COLORS.direct }} />}
                {d.meta > 0 && <div style={{ height: `${(d.meta / total) * 100}%`, background: SOURCE_COLORS.meta }} />}
                {d.organic > 0 && <div style={{ height: `${(d.organic / total) * 100}%`, background: SOURCE_COLORS.organic }} />}
                {d.referral > 0 && <div style={{ height: `${(d.referral / total) * 100}%`, background: SOURCE_COLORS.referral }} />}
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex gap-4 mt-3 justify-center">
        {Object.entries(SOURCE_COLORS).map(([key, color]) => (
          <div key={key} className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-sm" style={{ background: color }} />
            <span className="text-[10px] text-white/40 capitalize">{key}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

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
        <MetricCard label="Total Signups (period)" value={totalSignups} />
        <MetricCard label="Current Users" value={data.projections?.current ?? "—"} />
        <MetricCard label="MRR" value={latestMrr ? fmtDollars(latestMrr.mrr) : "—"} />
        <MetricCard label="Trial → Paid" value={latestTrialRate ? fmtPct(latestTrialRate.rate) : "—"} />
      </div>

      {/* ============================================================ */}
      {/*  1. User Growth                                              */}
      {/* ============================================================ */}
      <SectionHeader>User Growth</SectionHeader>

      <ChartCard title="Weekly Signups">
        <BarChart data={data.weeklySignups} labelKey="week" valueKey="count" formatLabel={fmtWeek} />
      </ChartCard>

      <ChartCard title="Cumulative Users">
        <BarChart data={data.cumulativeUsers} labelKey="week" valueKey="total" color="#9B7DFF" formatLabel={fmtWeek} />
      </ChartCard>

      <ChartCard title="Signups by Source">
        <StackedBarChart data={data.signupsBySource} />
      </ChartCard>

      <ChartCard title="Acquisition funnel — source × platform">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-white/40">
                <th className="py-2 pr-4 font-medium">Source</th>
                <th className="py-2 pr-4 font-medium">Platform</th>
                <th className="py-2 pr-4 text-right font-medium">Signups</th>
                <th className="py-2 pr-4 text-right font-medium">Activated</th>
                <th className="py-2 pr-4 text-right font-medium">Activation %</th>
                <th className="py-2 pr-4 text-right font-medium">Opened, no record</th>
                <th className="py-2 text-right font-medium">Never opened</th>
              </tr>
            </thead>
            <tbody>
              {(data.platformAcquisition ?? []).length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-white/30">
                    No data in range
                  </td>
                </tr>
              ) : (
                (data.platformAcquisition ?? []).map((r, i) => {
                  const pctColor =
                    r.activationPct < 15
                      ? "#FB7185"
                      : r.activationPct < 35
                        ? "#FBBF24"
                        : "#34D399";
                  return (
                    <tr
                      key={i}
                      className="border-t border-white/5 text-white/80"
                    >
                      <td className="py-2 pr-4">{r.source}</td>
                      <td className="py-2 pr-4">{r.platform}</td>
                      <td className="py-2 pr-4 text-right tabular-nums">
                        {r.signups}
                      </td>
                      <td className="py-2 pr-4 text-right tabular-nums">
                        {r.activated}
                      </td>
                      <td
                        className="py-2 pr-4 text-right font-semibold tabular-nums"
                        style={{ color: pctColor }}
                      >
                        {r.activationPct.toFixed(1)}%
                      </td>
                      <td className="py-2 pr-4 text-right tabular-nums text-white/50">
                        {r.openedNoRecord}
                      </td>
                      <td className="py-2 text-right tabular-nums text-white/50">
                        {r.neverOpened}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </ChartCard>

      {/* Projections callout */}
      {data.projections && (
        <div className="rounded-xl bg-[#13131F] border border-white/5 p-5">
          <h3 className="text-sm font-medium text-white/60 mb-2">Growth Projections</h3>
          <p className="text-sm text-white/80 leading-relaxed">
            Currently at{" "}
            <span className="font-semibold text-white">{data.projections.current} users</span>.
            At current growth:{" "}
            <span className="text-[#A78BFA] font-medium">100 users</span> by {fmtWeek(data.projections.growth100)},{" "}
            <span className="text-[#A78BFA] font-medium">500</span> by {fmtWeek(data.projections.growth500)},{" "}
            <span className="text-[#A78BFA] font-medium">1,000</span> by {fmtWeek(data.projections.growth1000)}.
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
                c.retention.week1, c.retention.week2, c.retention.week3,
                c.retention.week4, c.retention.week8, c.retention.week12,
              ];
              return (
                <tr key={c.cohortWeek} className="border-b border-white/5 text-white/70">
                  <td className="py-2 pr-4 whitespace-nowrap">{fmtWeek(c.cohortWeek)}</td>
                  <td className="py-2 pr-4 text-right">{c.signups}</td>
                  {weeks.map((pct, i) => (
                    <td key={i} className="py-2 pr-4 text-right last:pr-0">
                      {pct == null ? (
                        <span className="text-white/20">—</span>
                      ) : (
                        <span className={`inline-block rounded px-1.5 py-0.5 text-xs font-medium ${retentionColor(pct)}`}>
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
        <BarChart data={data.weeklyRecordings} labelKey="week" valueKey="count" color="#34D399" formatLabel={fmtWeek} />
      </ChartCard>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard title="Avg Recordings / User">
          <BarChart data={data.avgRecordingsPerUser} labelKey="week" valueKey="avg" color="#22D3EE" formatLabel={fmtWeek} formatValue={(v) => v.toFixed(1)} />
        </ChartCard>

        <ChartCard title="Avg Recording Duration">
          <BarChart data={data.avgDuration} labelKey="week" valueKey="seconds" color="#FBBF24" formatLabel={fmtWeek} formatValue={fmtDuration} />
        </ChartCard>
      </div>

      {/* ============================================================ */}
      {/*  4. Conversion Trends                                        */}
      {/* ============================================================ */}
      <SectionHeader>Conversion Trends</SectionHeader>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard title="Trial → Paid Rate">
          <BarChart data={data.trialToPaidRate} labelKey="week" valueKey="rate" color="#7C5CFC" formatLabel={fmtWeek} formatValue={(v) => `${v.toFixed(1)}%`} />
        </ChartCard>

        <ChartCard title="Median Time to First Recording">
          <BarChart data={data.medianTimeToFirstRecording} labelKey="week" valueKey="hours" color="#E06C75" formatLabel={fmtWeek} formatValue={(v) => `${v.toFixed(1)}h`} />
        </ChartCard>
      </div>

      {/* ============================================================ */}
      {/*  5. Revenue Growth                                           */}
      {/* ============================================================ */}
      <SectionHeader>Revenue Growth</SectionHeader>

      <ChartCard title="MRR Over Time">
        <BarChart data={data.mrrOverTime} labelKey="month" valueKey="mrr" color="#7C5CFC" formatLabel={fmtMonth} formatValue={(v) => fmtDollars(v)} />
      </ChartCard>

      <ChartCard title="Paying Users Over Time">
        <BarChart data={data.payingUsersOverTime} labelKey="month" valueKey="count" color="#34D399" formatLabel={fmtMonth} />
      </ChartCard>
    </div>
  );
}
