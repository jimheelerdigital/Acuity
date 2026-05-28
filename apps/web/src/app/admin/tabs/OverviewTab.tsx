"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
// Recharts removed — charts use CSS bars
import MetricCard from "../components/MetricCard";
import ChartCard from "../components/ChartCard";
import RefreshButton from "../components/RefreshButton";
// SafeChart no longer needed — all charts are CSS bars
import { SkeletonMetric, SkeletonChart, SkeletonTable } from "../components/SkeletonCard";
import { DrilldownModal } from "../components/DrilldownModal";
import { TabError } from "../components/TabError";
import { useTabData } from "./useTabData";
import {
  MONTHLY_PRICE_CENTS,
  formatDollarsRounded,
  formatDollars,
} from "@/lib/pricing";

type Drilldown = {
  metric: string;
  fallbackTitle: string;
  params?: Record<string, string>;
} | null;

interface OverviewData {
  // From getOverview
  signups: number;
  prevSignups: number;
  payingSubs: number;
  prevPayingSubs: number;
  conversionRate: number;
  prevConversionRate: number;
  aiSpendCents: number;
  blendedCac?: number | null;
  signupsOverTime: { date: string; count: number }[];
  aiByPurpose: { purpose: string; total: number }[];
  tryMet?: {
    today: number;
    thisWeek: number;
    allTime: number;
    conversions: number;
    conversionRate: number;
    dailyCapUsed: number;
    dailyCap: number;
  };
  webFunnel?: {
    steps: { label: string; count: number }[];
    alerts: { step: string; dropPct: number; severity: "red" | "yellow"; fix: string }[];
    diagnosticBreakdowns: Record<string, { value: string; count: number }[]>;
    commitmentStats: { completed: number; abandoned: number; successRate: number };
    sessions: {
      sessionId: string; userId: string | null; started: string; lastEvent: string;
      currentStep: string; stepNumber: number; totalSteps: number;
      status: "completed" | "paid" | "active" | "stalled" | "dropped";
      timeInFunnel: number; diagnosticAnswers: Record<string, string>;
      source: string; campaign: string | null; creative: string | null;
    }[];
    sessionsSummary: { activeSessions: number; completedToday: number; avgCompletionTime: number; mostCommonDrop: string };
    adAttribution: {
      creativeId: string; sessionsStarted: number; reachedMirror: number;
      reachedCommitment: number; signedUp: number; paid: number;
      completionRate: number; avgTimeToPay: number;
    }[];
  };
  // From getRevenue
  revenue: {
    mrrCents: number;
    payingSubs: number;
    trialUsers: number;
    churnRate: number;
    conversionRate: number;
    churnedInPeriod: number;
    pastDueUsers: { id: string; email: string; stripeCurrentPeriodEnd: string | null }[];
    recentPaying: { email: string; createdAt: string; stripeCurrentPeriodEnd: string | null }[];
    costs: { claudeApiCents: number; stripeFeeCents: number; resendCents: number; vercelCents: number; supabaseCents: number; totalCents: number };
    margin: { grossMarginCents: number; grossMarginPct: number };
    unitEconomics: { arpuCents: number; avgCostPerCustomerCents: number; contributionMarginCents: number; ltvCents: number; cacCents: number | null; ltvCacRatio: number | null };
  };
  // From getFunnel
  funnel: {
    steps: { label: string; count: number }[];
  };
  // From getRedFlags
  redFlags: {
    flags: { id: string; severity: string; category: string; title: string; description: string; affectedUserIds: string[]; createdAt: string }[];
  };
  // Deprecated — kept for type compat, no longer fetched
  tryFunnel?: {
    steps: { label: string; count: number }[];
  };
}

const SEVERITY_STYLES: Record<string, { border: string; bg: string; text: string; badge: string }> = {
  CRITICAL: { border: "border-red-500/30", bg: "bg-red-900/10", text: "text-red-300", badge: "bg-red-500/20 text-red-400" },
  WARNING: { border: "border-amber-500/30", bg: "bg-amber-900/10", text: "text-amber-300", badge: "bg-amber-500/20 text-amber-400" },
  INFO: { border: "border-blue-500/30", bg: "bg-blue-900/10", text: "text-blue-300", badge: "bg-blue-500/20 text-blue-400" },
};

const PIE_COLORS = ["#7C5CFC", "#9B7DFF", "#D4A843", "#4EBAAA", "#E06C75", "#56B6C2", "#98C379"];

const STEP_KEY: Record<string, string> = {
  "Waitlist Signups": "waitlist",
  "Account Created": "account",
  "First Recording": "first_recording",
  "Active Day 1": "active_d1",
  "Active Day 7": "active_d7",
  "Converted to Paid": "converted",
};

function fmt(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function marginColor(pct: number): string {
  if (pct >= 70) return "text-emerald-400";
  if (pct >= 40) return "text-amber-400";
  return "text-red-400";
}

function marginBg(pct: number): string {
  if (pct >= 70) return "border-emerald-500/20 bg-emerald-900/10";
  if (pct >= 40) return "border-amber-500/20 bg-amber-900/10";
  return "border-red-500/20 bg-red-900/10";
}

export default function OverviewTab({ start, end }: { start: string; end: string }) {
  const { data, loading, error, meta, refresh } = useTabData<OverviewData>("overview", start, end);
  const [drilldown, setDrilldown] = useState<Drilldown>(null);
  const [resolving, setResolving] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [expandedSession, setExpandedSession] = useState<string | null>(null);
  const router = useRouter();

  if (error && !data) return <TabError message={error} onRetry={refresh} />;

  if (loading || !data) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 2xl:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => <SkeletonMetric key={i} />)}
        </div>
        <SkeletonChart />
        <SkeletonTable />
      </div>
    );
  }

  const handleResolve = async (flagId: string, action: string) => {
    setResolving(flagId);
    try {
      await fetch("/api/admin/red-flags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ flagId, action }),
      });
      setDismissed((prev) => new Set(prev).add(flagId));
    } finally {
      setResolving(null);
    }
  };

  // Safe accessors — if a sub-query failed via safe(), these defaults prevent render crashes
  const redFlagsData = data.redFlags?.flags ?? [];
  const signupsOverTimeData: { date: string; count: number }[] = data.signupsOverTime ?? [];
  const rev = data.revenue ?? ({} as OverviewData["revenue"]);
  const funnelStepsData = data.funnel?.steps ?? [];
  const webFunnelData = data.webFunnel;
  const tryMet = data.tryMet ?? { today: 0, thisWeek: 0, allTime: 0, conversions: 0, conversionRate: 0, dailyCapUsed: 0, dailyCap: 100 };

  const visibleFlags = redFlagsData.filter((f) => !dismissed.has(f.id));
  const signupSparkline = signupsOverTimeData.map((d) => ({ v: d.count }));
  const maxFunnelCount = Math.max(...(funnelStepsData.length > 0 ? funnelStepsData.map((s) => s.count) : [1]), 1);

  return (
    <div className="space-y-6">
      {/* ── Red Flag Alert Banners ────────────────────────────────── */}
      {visibleFlags.length > 0 && (
        <div className="space-y-2">
          {visibleFlags.map((f) => {
            const style = SEVERITY_STYLES[f.severity] ?? SEVERITY_STYLES.INFO;
            return (
              <div key={f.id} className={`rounded-lg border ${style.border} ${style.bg} px-5 py-3 flex items-center justify-between gap-4`}>
                <div className="flex items-center gap-3 min-w-0">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium shrink-0 ${style.badge}`}>{f.severity}</span>
                  <span className={`text-sm font-medium ${style.text} truncate`}>{f.title}</span>
                  <span className="text-xs text-white/30 shrink-0">{f.category}</span>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button onClick={() => handleResolve(f.id, "resolve")} disabled={resolving === f.id} className="rounded-md bg-white/10 px-3 py-1 text-xs text-white/70 hover:bg-white/20 disabled:opacity-50">Resolve</button>
                  <button onClick={() => handleResolve(f.id, "dismiss")} disabled={resolving === f.id} className="rounded-md bg-white/5 px-3 py-1 text-xs text-white/40 hover:bg-white/10 disabled:opacity-50">Dismiss</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Refresh */}
      <div className="flex justify-end">
        <RefreshButton computedAt={meta?.computedAt ?? null} onRefresh={refresh} loading={loading} />
      </div>

      {/* ── Hero Metric Cards ────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 2xl:grid-cols-6">
        <MetricCard label="New Signups" value={data.signups} currentValue={data.signups} previousValue={data.prevSignups} sparklineData={signupSparkline} onClick={() => setDrilldown({ metric: "signups", fallbackTitle: "New Signups" })} />
        <MetricCard label="Active Users (Week)" value={data.signups} onClick={() => setDrilldown({ metric: "engagement_users", fallbackTitle: "Active Users", params: { window: "wau" } })} />
        <MetricCard label="Trial → Paid" value={`${data.conversionRate}%`} currentValue={data.conversionRate} previousValue={data.prevConversionRate} onClick={() => setDrilldown({ metric: "trial_to_paid", fallbackTitle: "Trial-to-Paid" })} />
        <MetricCard label="MRR" value={formatDollarsRounded(rev.mrrCents)} onClick={() => setDrilldown({ metric: "mrr_breakdown", fallbackTitle: "MRR Breakdown" })} />
        <MetricCard label="Churn Rate" value={`${rev.churnRate}%`} />
        <MetricCard label="Claude Spend (MTD)" value={`$${(data.aiSpendCents / 100).toFixed(2)}`} budgetBar={{ current: data.aiSpendCents, max: 10000 }} onClick={() => setDrilldown({ metric: "ai_spend_breakdown", fallbackTitle: "Claude Spend" })} />
      </div>

      {/* ── Funnel Visualization ──────────────────────────────────── */}
      <div className="rounded-xl bg-[#13131F] p-6">
        <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-white/40">User Funnel</h3>
        <div className="space-y-3 max-w-3xl mx-auto">
          {funnelStepsData.map((step, i) => {
            const pct = (step.count / maxFunnelCount) * 100;
            const prevCount = i > 0 ? funnelStepsData[i - 1].count : null;
            const dropOff = prevCount != null && prevCount > 0 ? Math.round(((prevCount - step.count) / prevCount) * 100) : null;
            const stepKey = STEP_KEY[step.label];
            const drillable = stepKey && step.count > 0;
            return (
              <button key={step.label} type="button" disabled={!drillable} onClick={() => drillable && setDrilldown({ metric: "funnel_step", fallbackTitle: step.label, params: { step: stepKey } })} className={`block w-full text-left ${drillable ? "cursor-pointer hover:opacity-90" : "cursor-default"}`}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm text-white/70">{step.label}</span>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-bold text-white">{step.count.toLocaleString()}</span>
                    {dropOff != null && dropOff > 0 && <span className="text-xs text-red-400/60">-{dropOff}% drop</span>}
                  </div>
                </div>
                <div className="h-7 w-full overflow-hidden rounded bg-white/5">
                  <div className="h-full rounded bg-gradient-to-r from-[#7C5CFC] to-[#9B7DFF] transition-all" style={{ width: `${Math.max(pct, 2)}%` }} />
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Charts Row ────────────────────────────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Signups Over Time">
          {signupsOverTimeData.length === 0 ? (
            <p className="text-sm text-white/40 py-12 text-center">Not enough data yet</p>
          ) : (() => {
            const max = Math.max(...signupsOverTimeData.map((d) => d.count), 1);
            return (
              <div className="flex items-end gap-1 h-48 pt-4">
                {signupsOverTimeData.map((d, i) => (
                  <div key={i} className="flex-1 flex flex-col items-center justify-end" title={`${d.date}: ${d.count}`}>
                    <div className="w-full rounded-t bg-[#7C5CFC]" style={{ height: `${Math.max(2, (d.count / max) * 100)}%` }} />
                    {signupsOverTimeData.length <= 14 && (
                      <span className="text-[8px] text-white/30 mt-1 tabular-nums">{d.date.slice(5)}</span>
                    )}
                  </div>
                ))}
              </div>
            );
          })()}
        </ChartCard>

        <ChartCard title="AI Cost by Feature (MTD)">
          {(data.aiByPurpose ?? []).length === 0 ? (
            <p className="text-sm text-white/40 py-12 text-center">Not enough data yet</p>
          ) : (() => {
            const items = data.aiByPurpose ?? [];
            const total = items.reduce((s, d) => s + d.total, 0) || 1;
            return (
              <div className="space-y-2 py-4">
                {items.map((d, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <span className="text-xs text-white/50 w-28 truncate shrink-0">{d.purpose}</span>
                    <div className="flex-1 h-5 bg-white/5 rounded overflow-hidden">
                      <div className="h-full rounded" style={{ width: `${(d.total / total) * 100}%`, background: PIE_COLORS[i % PIE_COLORS.length] }} />
                    </div>
                    <span className="text-xs text-white/40 w-16 shrink-0 text-right tabular-nums">${(d.total / 100).toFixed(2)}</span>
                  </div>
                ))}
              </div>
            );
          })()}
        </ChartCard>
      </div>

      {/* ── Revenue Summary ──────────────────────────────────────── */}
      {rev?.margin ? <><div className={`rounded-xl border p-5 ${marginBg(rev.margin.grossMarginPct)}`}>
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-medium text-white/60 mb-1">Gross Margin</h3>
            <div className="flex items-baseline gap-3">
              <span className={`text-3xl font-bold ${marginColor(rev.margin.grossMarginPct)}`}>{rev.margin.grossMarginPct}%</span>
              <span className="text-sm text-white/40">{fmt(rev.margin.grossMarginCents)} / mo</span>
            </div>
          </div>
          <div className="text-right text-xs text-white/30">{rev.margin.grossMarginPct >= 70 ? "Healthy" : rev.margin.grossMarginPct >= 40 ? "Watch closely" : "Below target"}</div>
        </div>
      </div>

      {/* Unit Economics Grid */}
      <div className="rounded-xl bg-[#13131F] p-5">
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-white/40">Unit Economics</h3>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
          <MiniMetric label="ARPU" value={fmt(rev.unitEconomics.arpuCents)} />
          <MiniMetric label="Avg Cost / Customer" value={fmt(rev.unitEconomics.avgCostPerCustomerCents)} />
          <MiniMetric label="Contribution Margin" value={fmt(rev.unitEconomics.contributionMarginCents)} color={rev.unitEconomics.contributionMarginCents > 0 ? "text-emerald-400" : "text-red-400"} />
          <MiniMetric label="Estimated LTV" value={fmt(rev.unitEconomics.ltvCents)} sub="Capped at 36 months" />
          <MiniMetric label="LTV : CAC" value={rev.unitEconomics.ltvCacRatio !== null ? `${rev.unitEconomics.ltvCacRatio}x` : "N/A"} color={rev.unitEconomics.ltvCacRatio === null ? "text-white/30" : rev.unitEconomics.ltvCacRatio >= 3 ? "text-emerald-400" : "text-amber-400"} />
          <MiniMetric label="CAC" value={rev.unitEconomics.cacCents !== null ? fmt(rev.unitEconomics.cacCents) : "No ad spend"} />
        </div>
      </div>
      </> : null}

      {/* ── Funnel quick link — full analytics in dedicated tab ── */}
      {webFunnelData?.steps && (
        <div className="rounded-xl bg-[#13131F] p-5 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-white">Onboarding Funnel</h3>
            <p className="text-xs text-[#A0A0B8] mt-0.5">
              {webFunnelData.sessionsSummary.activeSessions} active, {webFunnelData.sessionsSummary.completedToday} completed today
            </p>
          </div>
          <button onClick={() => router.push("/admin?tab=funnel-analytics")}
            className="rounded-lg border border-[#7C5CFC]/30 bg-[#7C5CFC]/10 px-4 py-2 text-xs text-[#7C5CFC] hover:bg-[#7C5CFC]/20 transition">
            View Funnel Analytics &rarr;
          </button>
        </div>
      )}

      {/* ── Past Due Alerts ──────────────────────────────────────── */}
      {rev.pastDueUsers.length > 0 && (
        <div className="rounded-xl border border-red-500/20 bg-red-900/10 p-5">
          <h3 className="mb-3 text-sm font-medium text-red-400">Failed Payments ({rev.pastDueUsers.length})</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead><tr className="border-b border-red-500/10 text-red-300/60"><th className="pb-2 pr-4 font-medium">Email</th><th className="pb-2 font-medium">Period End</th></tr></thead>
              <tbody>
                {rev.pastDueUsers.map((u) => (
                  <tr key={u.id} className="cursor-pointer border-b border-red-500/5 text-red-200/70 hover:bg-red-500/5" onClick={() => router.push(`/admin?tab=users&select=${u.id}`)}>
                    <td className="py-2 pr-4">{u.email}</td>
                    <td className="py-2">{u.stripeCurrentPeriodEnd ? new Date(u.stripeCurrentPeriodEnd).toLocaleDateString() : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {drilldown && (
        <DrilldownModal metric={drilldown.metric} start={start} end={end} fallbackTitle={drilldown.fallbackTitle} params={drilldown.params} onClose={() => setDrilldown(null)} />
      )}
    </div>
  );
}

function MiniMetric({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="rounded-lg bg-white/[0.03] px-4 py-3">
      <div className="text-[11px] uppercase tracking-wider text-white/30 mb-1">{label}</div>
      <div className={`text-lg font-semibold tabular-nums ${color ?? "text-white"}`}>{value}</div>
      {sub && <div className="text-[10px] text-white/20 mt-0.5">{sub}</div>}
    </div>
  );
}

