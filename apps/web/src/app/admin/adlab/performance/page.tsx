"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import Link from "next/link";
import {
  Loader2,
  ArrowUpDown,
  Download,
  ChevronDown,
  ChevronUp,
  BarChart3,
} from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Legend,
} from "recharts";

// ─── Types ────────────────────────────────────────────────────────────────────

interface SummaryMetrics {
  spendCents: number;
  conversions: number;
  impressions: number;
  clicks: number;
  avgCplCents: number | null;
  avgCtr: number;
}

interface Summary {
  allTime: SummaryMetrics;
  range: SummaryMetrics;
  activeExperiments: number;
  liveAds: number;
  concludedExperiments: number;
}

interface ExperimentRow {
  id: string;
  topicBrief: string;
  status: string;
  launchedAt: string | null;
  concludedAt: string | null;
  totalAds: number;
  spendCents: number;
  conversions: number;
  avgCplCents: number | null;
  avgCtr: number;
  bestAngle: string | null;
}

interface Decision {
  id: string;
  decisionType: string;
  rationale: string;
  executedAt: string;
  priorBudgetCents: number | null;
  newBudgetCents: number | null;
}

interface AdRow {
  adId: string;
  headline: string;
  primaryText: string;
  status: string;
  experimentId: string;
  experimentBrief: string;
  angleHypothesis: string;
  angleSurface: string;
  launchedAt: string | null;
  impressions: number;
  clicks: number;
  ctr: number;
  spendCents: number;
  conversions: number;
  cplCents: number | null;
  cpcCents: number | null;
  frequency: number;
  decisionsCount: number;
  decisions: Decision[];
}

interface AiCost {
  experimentId: string;
  claudeCalls: number;
  tokensIn: number;
  tokensOut: number;
  claudeCostCents: number;
  imageGens: number;
  imageCostCents: number;
}

interface PerformanceData {
  from: string;
  to: string;
  summary: Summary;
  experiments: ExperimentRow[];
  dailySeries: Record<string, unknown>[];
  experimentIds: string[];
  experimentLabels: Record<string, string>;
  targetCplCents: number | null;
  ads: AdRow[];
  aiCosts: AiCost[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const $ = (cents: number) => `$${(cents / 100).toFixed(2)}`;
const pct = (v: number) => `${v.toFixed(2)}%`;

const EXP_COLORS = [
  "#7C5CFC", "#10B981", "#F59E0B", "#EF4444", "#06B6D4",
  "#EC4899", "#8B5CF6", "#14B8A6", "#F97316", "#6366F1",
];

const STATUS_COLORS: Record<string, string> = {
  live: "bg-emerald-500/20 text-emerald-400",
  paused: "bg-yellow-500/20 text-yellow-400",
  scaled: "bg-blue-500/20 text-blue-400",
  killed: "bg-red-500/20 text-red-400",
  draft: "bg-zinc-500/20 text-zinc-400",
  awaiting_approval: "bg-amber-500/20 text-amber-400",
  concluded: "bg-[#7C5CFC]/20 text-[#7C5CFC]",
};

const DECISION_COLORS: Record<string, string> = {
  kill: "bg-red-500/15 text-red-400",
  scale: "bg-emerald-500/15 text-emerald-400",
  maintain: "bg-zinc-500/15 text-zinc-400",
  manual: "bg-[#7C5CFC]/15 text-[#7C5CFC]",
};

type DatePreset = "7d" | "14d" | "30d" | "90d" | "all" | "custom";

function getPresetDates(preset: DatePreset): { from: string; to: string } {
  const now = new Date();
  const to = now.toISOString().split("T")[0];
  if (preset === "all") return { from: "2020-01-01", to };
  const days = preset === "7d" ? 7 : preset === "14d" ? 14 : preset === "90d" ? 90 : 30;
  const from = new Date(now.getTime() - days * 86400000).toISOString().split("T")[0];
  return { from, to };
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function PerformancePage() {
  const [data, setData] = useState<PerformanceData | null>(null);
  const [loading, setLoading] = useState(true);

  const [preset, setPreset] = useState<DatePreset>("30d");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  const { from, to } = useMemo(() => {
    if (preset === "custom" && customFrom && customTo) return { from: customFrom, to: customTo };
    return getPresetDates(preset);
  }, [preset, customFrom, customTo]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/adlab/performance?from=${from}&to=${to}`);
      if (res.ok) setData(await res.json());
    } catch { /* silent */ }
    setLoading(false);
  }, [from, to]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Sorting state
  const [expSort, setExpSort] = useState<{ key: string; asc: boolean }>({ key: "launchedAt", asc: false });
  const [adSort, setAdSort] = useState<{ key: string; asc: boolean }>({ key: "spendCents", asc: false });
  const [expandedAd, setExpandedAd] = useState<string | null>(null);

  function toggleExpSort(key: string) {
    setExpSort((s) => s.key === key ? { key, asc: !s.asc } : { key, asc: false });
  }
  function toggleAdSort(key: string) {
    setAdSort((s) => s.key === key ? { key, asc: !s.asc } : { key, asc: false });
  }

  const sortedExperiments = useMemo(() => {
    if (!data) return [];
    return [...data.experiments].sort((a, b) => {
      const av = (a as Record<string, unknown>)[expSort.key] ?? "";
      const bv = (b as Record<string, unknown>)[expSort.key] ?? "";
      if (av < bv) return expSort.asc ? -1 : 1;
      if (av > bv) return expSort.asc ? 1 : -1;
      return 0;
    });
  }, [data, expSort]);

  const sortedAds = useMemo(() => {
    if (!data) return [];
    return [...data.ads].sort((a, b) => {
      const av = (a as Record<string, unknown>)[adSort.key] ?? -1;
      const bv = (b as Record<string, unknown>)[adSort.key] ?? -1;
      if (av < bv) return adSort.asc ? -1 : 1;
      if (av > bv) return adSort.asc ? 1 : -1;
      return 0;
    });
  }, [data, adSort]);

  // CSV export
  function downloadCsv() {
    if (!data) return;
    const headers = [
      "experiment_name", "angle_hypothesis", "headline", "primary_text", "status",
      "impressions", "clicks", "ctr", "spend_dollars", "conversions",
      "cpl_dollars", "cpc_dollars", "frequency", "launched_date", "decisions_count",
    ];
    const rows = sortedAds.map((a) => [
      `"${a.experimentBrief.replace(/"/g, '""')}"`,
      `"${a.angleHypothesis.replace(/"/g, '""')}"`,
      `"${a.headline.replace(/"/g, '""')}"`,
      `"${a.primaryText.replace(/"/g, '""')}"`,
      a.status,
      a.impressions,
      a.clicks,
      a.ctr,
      (a.spendCents / 100).toFixed(2),
      a.conversions,
      a.cplCents ? (a.cplCents / 100).toFixed(2) : "",
      a.cpcCents ? (a.cpcCents / 100).toFixed(2) : "",
      a.frequency,
      a.launchedAt ? a.launchedAt.split("T")[0] : "",
      a.decisionsCount,
    ]);
    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `adlab-performance-${from}-to-${to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 text-[#A0A0B8] animate-spin" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="rounded-xl border border-dashed border-white/20 bg-[#13131F] p-12 text-center">
        <BarChart3 className="h-10 w-10 text-[#A0A0B8] mx-auto mb-4" />
        <p className="text-sm text-[#A0A0B8]">Failed to load performance data.</p>
      </div>
    );
  }

  const s = data.summary;
  const hasAds = data.ads.length > 0;
  const hasDailySeries = data.dailySeries.length > 0;

  return (
    <>
      {/* ── Header + Date Range + Export ── */}
      <div className="flex items-start justify-between mb-6 flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white mb-1">Performance</h1>
          <p className="text-sm text-[#A0A0B8]">Ad performance metrics, trends, and analytics.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Date presets */}
          {(["7d", "14d", "30d", "90d", "all"] as DatePreset[]).map((p) => (
            <button
              key={p}
              onClick={() => setPreset(p)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                preset === p
                  ? "bg-[#7C5CFC] text-white"
                  : "border border-white/10 text-[#A0A0B8] hover:text-white hover:border-white/20"
              }`}
            >
              {p === "all" ? "All Time" : p.replace("d", " days")}
            </button>
          ))}
          <button
            onClick={() => setPreset("custom")}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
              preset === "custom"
                ? "bg-[#7C5CFC] text-white"
                : "border border-white/10 text-[#A0A0B8] hover:text-white hover:border-white/20"
            }`}
          >
            Custom
          </button>
          {preset === "custom" && (
            <>
              <input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="rounded-lg border border-white/10 bg-[#1E1E2E] px-2 py-1 text-xs text-white outline-none focus:border-[#7C5CFC]"
              />
              <span className="text-xs text-[#A0A0B8]">to</span>
              <input
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                className="rounded-lg border border-white/10 bg-[#1E1E2E] px-2 py-1 text-xs text-white outline-none focus:border-[#7C5CFC]"
              />
            </>
          )}
          {hasAds && (
            <button
              onClick={downloadCsv}
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs text-[#A0A0B8] hover:text-white hover:border-white/20 transition"
            >
              <Download className="h-3.5 w-3.5" /> CSV
            </button>
          )}
        </div>
      </div>

      {/* ── Section 4: Summary Cards ── */}
      <div className="grid gap-3 grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 mb-8">
        <SummaryCard label="Total Spend" allTime={$(s.allTime.spendCents)} range={$(s.range.spendCents)} />
        <SummaryCard label="Conversions" allTime={String(s.allTime.conversions)} range={String(s.range.conversions)} />
        <SummaryCard label="Avg CPL" allTime={s.allTime.avgCplCents ? $(s.allTime.avgCplCents) : "—"} range={s.range.avgCplCents ? $(s.range.avgCplCents) : "—"} />
        <SummaryCard label="Avg CTR" allTime={pct(s.allTime.avgCtr)} range={pct(s.range.avgCtr)} />
        <SummaryCard label="Impressions" allTime={s.allTime.impressions.toLocaleString()} range={s.range.impressions.toLocaleString()} />
        <SummaryCard label="Active Exps" allTime={String(s.activeExperiments)} />
        <SummaryCard label="Live Ads" allTime={String(s.liveAds)} />
        <SummaryCard label="Concluded" allTime={String(s.concludedExperiments)} />
      </div>

      {!hasAds ? (
        <div className="rounded-xl border border-dashed border-white/20 bg-[#13131F] p-12 text-center">
          <BarChart3 className="h-10 w-10 text-[#A0A0B8] mx-auto mb-4" />
          <p className="text-sm text-[#A0A0B8] mb-2">No performance data yet.</p>
          <p className="text-xs text-[#A0A0B8]/60">Launch your first experiment to see metrics here. The daily cron syncs data from Meta every morning.</p>
        </div>
      ) : (
        <>
          {/* ── Section 1: Experiment Overview Table ── */}
          <div className="rounded-xl border border-white/10 bg-[#13131F] overflow-x-auto mb-8">
            <div className="px-5 py-3 border-b border-white/10">
              <h2 className="text-sm font-semibold text-white">Experiments</h2>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10 text-[#A0A0B8] text-xs">
                  <SortTh label="Experiment" k="topicBrief" sort={expSort} onSort={toggleExpSort} />
                  <SortTh label="Status" k="status" sort={expSort} onSort={toggleExpSort} />
                  <SortTh label="Ads" k="totalAds" sort={expSort} onSort={toggleExpSort} />
                  <SortTh label="Spend" k="spendCents" sort={expSort} onSort={toggleExpSort} />
                  <SortTh label="Conv." k="conversions" sort={expSort} onSort={toggleExpSort} />
                  <SortTh label="CPL" k="avgCplCents" sort={expSort} onSort={toggleExpSort} />
                  <SortTh label="CTR" k="avgCtr" sort={expSort} onSort={toggleExpSort} />
                  <th className="px-3 py-2.5 text-left text-xs font-medium">Best Angle</th>
                  <SortTh label="Launched" k="launchedAt" sort={expSort} onSort={toggleExpSort} />
                </tr>
              </thead>
              <tbody>
                {sortedExperiments.map((exp) => (
                  <tr
                    key={exp.id}
                    className="border-b border-white/5 hover:bg-white/[0.02] cursor-pointer"
                    onClick={() => window.location.href = `/admin/adlab/experiments/${exp.id}`}
                  >
                    <td className="px-3 py-2.5 text-white max-w-[200px] truncate">{exp.topicBrief.slice(0, 60)}</td>
                    <td className="px-3 py-2.5">
                      <StatusBadge status={exp.status} />
                    </td>
                    <td className="px-3 py-2.5 text-[#A0A0B8] text-right">{exp.totalAds}</td>
                    <td className="px-3 py-2.5 text-white text-right">{$(exp.spendCents)}</td>
                    <td className="px-3 py-2.5 text-white text-right">{exp.conversions}</td>
                    <td className="px-3 py-2.5 text-[#A0A0B8] text-right">{exp.avgCplCents ? $(exp.avgCplCents) : "—"}</td>
                    <td className="px-3 py-2.5 text-[#A0A0B8] text-right">{pct(exp.avgCtr)}</td>
                    <td className="px-3 py-2.5 text-[#A0A0B8] max-w-[150px] truncate text-xs">{exp.bestAngle ?? "—"}</td>
                    <td className="px-3 py-2.5 text-[#A0A0B8]">{exp.launchedAt ? new Date(exp.launchedAt).toLocaleDateString() : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* ── Section 2: Trend Charts ── */}
          {hasDailySeries && (
            <div className="grid gap-6 lg:grid-cols-2 mb-8">
              {/* Chart 1: Daily Spend & Conversions */}
              <div className="rounded-xl border border-white/10 bg-[#13131F] p-5">
                <h3 className="text-sm font-semibold text-white mb-4">Daily Spend & Conversions</h3>
                <ResponsiveContainer width="100%" height={280}>
                  <LineChart data={data.dailySeries}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                    <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#A0A0B8" }} tickFormatter={(v: string) => v.slice(5)} />
                    <YAxis yAxisId="spend" tick={{ fontSize: 10, fill: "#A0A0B8" }} tickFormatter={(v: number) => `$${v}`} />
                    <YAxis yAxisId="conv" orientation="right" tick={{ fontSize: 10, fill: "#10B981" }} />
                    <Tooltip
                      contentStyle={{ background: "#1E1E2E", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 12 }}
                      labelStyle={{ color: "#A0A0B8" }}
                    />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    {data.experimentIds.map((id, i) => (
                      <Line
                        key={`spend_${id}`}
                        yAxisId="spend"
                        type="monotone"
                        dataKey={`spend_${id}`}
                        name={`Spend: ${data.experimentLabels[id] ?? id.slice(0, 8)}`}
                        stroke={EXP_COLORS[i % EXP_COLORS.length]}
                        strokeWidth={2}
                        dot={false}
                      />
                    ))}
                    {data.experimentIds.map((id, i) => (
                      <Line
                        key={`conv_${id}`}
                        yAxisId="conv"
                        type="monotone"
                        dataKey={`conv_${id}`}
                        name={`Conv: ${data.experimentLabels[id] ?? id.slice(0, 8)}`}
                        stroke={EXP_COLORS[i % EXP_COLORS.length]}
                        strokeWidth={2}
                        strokeDasharray="5 5"
                        dot={false}
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>

              {/* Chart 2: Daily CPL */}
              <div className="rounded-xl border border-white/10 bg-[#13131F] p-5">
                <h3 className="text-sm font-semibold text-white mb-4">Daily CPL</h3>
                <ResponsiveContainer width="100%" height={280}>
                  <LineChart data={data.dailySeries}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                    <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#A0A0B8" }} tickFormatter={(v: string) => v.slice(5)} />
                    <YAxis tick={{ fontSize: 10, fill: "#A0A0B8" }} tickFormatter={(v: number) => `$${v}`} />
                    <Tooltip
                      contentStyle={{ background: "#1E1E2E", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 12 }}
                      labelStyle={{ color: "#A0A0B8" }}
                    />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    {data.targetCplCents && (
                      <ReferenceLine
                        y={data.targetCplCents / 100}
                        stroke="#EF4444"
                        strokeDasharray="8 4"
                        label={{ value: `Target $${(data.targetCplCents / 100).toFixed(2)}`, fill: "#EF4444", fontSize: 10, position: "right" }}
                      />
                    )}
                    {data.experimentIds.map((id, i) => (
                      <Line
                        key={`cpl_${id}`}
                        type="monotone"
                        dataKey={`cpl_${id}`}
                        name={data.experimentLabels[id] ?? id.slice(0, 8)}
                        stroke={EXP_COLORS[i % EXP_COLORS.length]}
                        strokeWidth={2}
                        dot={false}
                        connectNulls
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* ── Section 3: Ad Detail Table ── */}
          <div className="rounded-xl border border-white/10 bg-[#13131F] overflow-x-auto mb-8">
            <div className="px-5 py-3 border-b border-white/10">
              <h2 className="text-sm font-semibold text-white">All Ads</h2>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10 text-[#A0A0B8] text-xs">
                  <SortTh label="Headline" k="headline" sort={adSort} onSort={toggleAdSort} />
                  <SortTh label="Angle" k="angleHypothesis" sort={adSort} onSort={toggleAdSort} />
                  <SortTh label="Status" k="status" sort={adSort} onSort={toggleAdSort} />
                  <SortTh label="Impr." k="impressions" sort={adSort} onSort={toggleAdSort} />
                  <SortTh label="Clicks" k="clicks" sort={adSort} onSort={toggleAdSort} />
                  <SortTh label="CTR" k="ctr" sort={adSort} onSort={toggleAdSort} />
                  <SortTh label="Spend" k="spendCents" sort={adSort} onSort={toggleAdSort} />
                  <SortTh label="Conv." k="conversions" sort={adSort} onSort={toggleAdSort} />
                  <SortTh label="CPL" k="cplCents" sort={adSort} onSort={toggleAdSort} />
                  <SortTh label="CPC" k="cpcCents" sort={adSort} onSort={toggleAdSort} />
                  <SortTh label="Freq." k="frequency" sort={adSort} onSort={toggleAdSort} />
                  <SortTh label="Dec." k="decisionsCount" sort={adSort} onSort={toggleAdSort} />
                </tr>
              </thead>
              <tbody>
                {sortedAds.map((ad) => (
                  <AdDetailRow
                    key={ad.adId}
                    ad={ad}
                    expanded={expandedAd === ad.adId}
                    onToggle={() => setExpandedAd(expandedAd === ad.adId ? null : ad.adId)}
                  />
                ))}
              </tbody>
            </table>
          </div>

          {/* ── Section 5: AI Cost Tracking ── */}
          {data.aiCosts.length > 0 && (
            <div className="rounded-xl border border-white/10 bg-[#13131F] overflow-x-auto mb-8">
              <div className="px-5 py-3 border-b border-white/10">
                <h2 className="text-sm font-semibold text-white">AI Generation Costs</h2>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/10 text-[#A0A0B8] text-xs">
                    <th className="px-3 py-2.5 text-left font-medium">Source</th>
                    <th className="px-3 py-2.5 text-right font-medium">Claude Calls</th>
                    <th className="px-3 py-2.5 text-right font-medium">Tokens In</th>
                    <th className="px-3 py-2.5 text-right font-medium">Tokens Out</th>
                    <th className="px-3 py-2.5 text-right font-medium">Claude Cost</th>
                    <th className="px-3 py-2.5 text-right font-medium">Image Gens</th>
                    <th className="px-3 py-2.5 text-right font-medium">Image Cost</th>
                    <th className="px-3 py-2.5 text-right font-medium">Total AI Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {data.aiCosts.map((ai) => {
                    const label = ai.experimentId === "adlab_global"
                      ? "AdLab (all experiments)"
                      : (data.experimentLabels[ai.experimentId] ?? ai.experimentId.slice(0, 8));
                    const totalCostCents = ai.claudeCostCents + ai.imageCostCents;
                    return (
                      <tr key={ai.experimentId} className="border-b border-white/5">
                        <td className="px-3 py-2.5 text-white">{label}</td>
                        <td className="px-3 py-2.5 text-[#A0A0B8] text-right">{ai.claudeCalls}</td>
                        <td className="px-3 py-2.5 text-[#A0A0B8] text-right">{ai.tokensIn.toLocaleString()}</td>
                        <td className="px-3 py-2.5 text-[#A0A0B8] text-right">{ai.tokensOut.toLocaleString()}</td>
                        <td className="px-3 py-2.5 text-white text-right">{$(ai.claudeCostCents)}</td>
                        <td className="px-3 py-2.5 text-[#A0A0B8] text-right">{ai.imageGens}</td>
                        <td className="px-3 py-2.5 text-white text-right">{$(ai.imageCostCents)}</td>
                        <td className="px-3 py-2.5 text-white text-right font-medium">{$(totalCostCents)}</td>
                      </tr>
                    );
                  })}
                  {/* Total row */}
                  {data.aiCosts.length > 1 && (() => {
                    const totals = data.aiCosts.reduce(
                      (acc, ai) => ({
                        claudeCalls: acc.claudeCalls + ai.claudeCalls,
                        tokensIn: acc.tokensIn + ai.tokensIn,
                        tokensOut: acc.tokensOut + ai.tokensOut,
                        claudeCost: acc.claudeCost + ai.claudeCostCents,
                        imageGens: acc.imageGens + ai.imageGens,
                        imageCost: acc.imageCost + ai.imageCostCents,
                      }),
                      { claudeCalls: 0, tokensIn: 0, tokensOut: 0, claudeCost: 0, imageGens: 0, imageCost: 0 }
                    );
                    const totalAdSpend = data.summary.allTime.spendCents;
                    return (
                      <>
                        <tr className="border-t border-white/10 bg-white/[0.02]">
                          <td className="px-3 py-2.5 text-white font-semibold">Total AI</td>
                          <td className="px-3 py-2.5 text-white text-right font-medium">{totals.claudeCalls}</td>
                          <td className="px-3 py-2.5 text-white text-right font-medium">{totals.tokensIn.toLocaleString()}</td>
                          <td className="px-3 py-2.5 text-white text-right font-medium">{totals.tokensOut.toLocaleString()}</td>
                          <td className="px-3 py-2.5 text-white text-right font-medium">{$(totals.claudeCost)}</td>
                          <td className="px-3 py-2.5 text-white text-right font-medium">{totals.imageGens}</td>
                          <td className="px-3 py-2.5 text-white text-right font-medium">{$(totals.imageCost)}</td>
                          <td className="px-3 py-2.5 text-white text-right font-medium">{$(totals.claudeCost + totals.imageCost)}</td>
                        </tr>
                        <tr className="bg-white/[0.02]">
                          <td className="px-3 py-2.5 text-[#7C5CFC] font-semibold" colSpan={7}>All-In (AI + Ad Spend)</td>
                          <td className="px-3 py-2.5 text-[#7C5CFC] text-right font-bold">
                            {$(totals.claudeCost + totals.imageCost + totalAdSpend)}
                          </td>
                        </tr>
                      </>
                    );
                  })()}
                </tbody>
              </table>
              <p className="px-5 py-2 text-[10px] text-[#A0A0B8]/50 border-t border-white/5">
                Claude costs from ClaudeCallLog. Image costs estimated at ~$0.02/image (gpt-image-2).
              </p>
            </div>
          )}
        </>
      )}
    </>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SummaryCard({ label, allTime, range }: { label: string; allTime: string; range?: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-[#13131F] p-4">
      <p className="text-[10px] text-[#A0A0B8] mb-1">{label}</p>
      <p className="text-lg font-semibold text-white">{allTime}</p>
      {range && <p className="text-[10px] text-[#A0A0B8]/60 mt-0.5">Range: {range}</p>}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUS_COLORS[status] || "bg-white/10 text-white"}`}>
      {status.replace("_", " ")}
    </span>
  );
}

function SortTh({ label, k, sort, onSort }: {
  label: string;
  k: string;
  sort: { key: string; asc: boolean };
  onSort: (key: string) => void;
}) {
  return (
    <th
      className="px-3 py-2.5 text-left cursor-pointer hover:text-white transition-colors select-none whitespace-nowrap font-medium"
      onClick={() => onSort(k)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        <ArrowUpDown className={`h-3 w-3 ${sort.key === k ? "text-[#7C5CFC]" : "opacity-30"}`} />
      </span>
    </th>
  );
}

function AdDetailRow({ ad, expanded, onToggle }: { ad: AdRow; expanded: boolean; onToggle: () => void }) {
  return (
    <>
      <tr
        className="border-b border-white/5 hover:bg-white/[0.02] cursor-pointer"
        onClick={onToggle}
      >
        <td className="px-3 py-2.5">
          <div className="flex items-center gap-1.5">
            {ad.decisionsCount > 0 && (
              expanded ? <ChevronUp className="h-3 w-3 text-[#A0A0B8] shrink-0" /> : <ChevronDown className="h-3 w-3 text-[#A0A0B8] shrink-0" />
            )}
            <Link
              href={`/admin/adlab/experiments/${ad.experimentId}`}
              onClick={(e) => e.stopPropagation()}
              className="text-white hover:text-[#7C5CFC] transition-colors line-clamp-1"
            >
              {ad.headline}
            </Link>
          </div>
        </td>
        <td className="px-3 py-2.5 text-[#A0A0B8] text-xs max-w-[150px] truncate">{ad.angleHypothesis.slice(0, 50)}</td>
        <td className="px-3 py-2.5"><StatusBadge status={ad.status} /></td>
        <td className="px-3 py-2.5 text-[#A0A0B8] text-right">{ad.impressions.toLocaleString()}</td>
        <td className="px-3 py-2.5 text-[#A0A0B8] text-right">{ad.clicks.toLocaleString()}</td>
        <td className="px-3 py-2.5 text-[#A0A0B8] text-right">{pct(ad.ctr)}</td>
        <td className="px-3 py-2.5 text-white text-right">{$(ad.spendCents)}</td>
        <td className="px-3 py-2.5 text-white text-right">{ad.conversions}</td>
        <td className="px-3 py-2.5 text-[#A0A0B8] text-right">{ad.cplCents ? $(ad.cplCents) : "—"}</td>
        <td className="px-3 py-2.5 text-[#A0A0B8] text-right">{ad.cpcCents ? $(ad.cpcCents) : "—"}</td>
        <td className="px-3 py-2.5 text-[#A0A0B8] text-right">{ad.frequency.toFixed(1)}</td>
        <td className="px-3 py-2.5 text-[#A0A0B8] text-right">{ad.decisionsCount}</td>
      </tr>
      {expanded && ad.decisions.length > 0 && (
        <tr>
          <td colSpan={12} className="bg-[#0A0A0F] px-6 py-3">
            <p className="text-[10px] font-medium text-[#A0A0B8] uppercase tracking-wider mb-2">Decision Log</p>
            <div className="space-y-1.5">
              {ad.decisions.map((d) => (
                <div key={d.id} className="flex items-start gap-2 text-xs">
                  <span className={`rounded px-1.5 py-0.5 text-[9px] font-medium mt-0.5 shrink-0 ${DECISION_COLORS[d.decisionType] || "bg-zinc-500/15 text-zinc-400"}`}>
                    {d.decisionType}
                  </span>
                  <span className="text-[#A0A0B8] flex-1">{d.rationale}</span>
                  {d.priorBudgetCents != null && d.newBudgetCents != null && (
                    <span className="text-[10px] text-[#A0A0B8]/60 shrink-0">
                      {$(d.priorBudgetCents)} → {$(d.newBudgetCents)}
                    </span>
                  )}
                  <span className="text-[10px] text-[#A0A0B8]/40 shrink-0">
                    {new Date(d.executedAt).toLocaleDateString()}
                  </span>
                </div>
              ))}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
