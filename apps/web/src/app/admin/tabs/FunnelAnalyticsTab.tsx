"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useTabData } from "./useTabData";
import { TabError } from "../components/TabError";
import { SkeletonMetric, SkeletonChart, SkeletonTable } from "../components/SkeletonCard";

type SortCol = "session" | "started" | "source" | "campaign" | "step" | "status" | "time";
type SortDir = "asc" | "desc";

interface FunnelStep { key: string; label: string; count: number; stepConversion: number; overallConversion: number; color: string; }
interface Alert { step: string; conversion: number; suggestion: string; }
interface CampaignFunnel {
  campaign: string; sessions: number;
  steps: Record<string, number>;
  conversionRate: number; avgTimeSec: number;
  diagnosticDistribution: Record<string, Record<string, number>>;
  creatives: { creativeId: string; sessions: number; maxStep: number; paid: number; convRate: number }[];
}
interface SessionRow {
  sessionId: string; started: string; lastEvent: string; status: string;
  currentStep: string; stepNumber: number; timeInFunnelSec: number;
  source: string; campaign: string | null; creative: string | null;
  diagnosticAnswers: Record<string, string>;
  events: { event: string; value: string | null; createdAt: string }[];
  browser: string | null;
}
interface BranchRow {
  branch: string; sessions: number;
  entryToQ4: number; q4ToMirror: number; mirrorToCommit: number; commitToPaywall: number; paywallToPaid: number;
  overallRate: number;
}
interface TimePerStep { step: string; key: string; medianSec: number; samples: number; }
interface AnswerDist { question: string; answers: { answer: string; count: number; pct: number }[]; }
interface DropOff { step: string; count: number; topBranch: string; avgTimeSec: number; }
interface DailyRate { date: string; entry: number; paid: number; rate: number; }
interface RecentPayment { branch: string; campaign: string; time: string; }

interface FunnelData {
  keyMetrics: { totalSessions: number; todaySessions: number; completionRate: number; biggestDrop: { step: string; dropPct: number }; avgFunnelTimeSec: number };
  funnelSteps: FunnelStep[];
  alerts: Alert[];
  campaignFunnels: CampaignFunnel[];
  branchBreakdown: BranchRow[];
  timePerStep: TimePerStep[];
  answerDistribution: AnswerDist[];
  dropOffAnalysis: DropOff[];
  dailyRates: DailyRate[];
  activeSessions: number;
  recentPayments: RecentPayment[];
  campaignNames: Record<string, string>;
  effectiveStart: string;
  sessions: SessionRow[];
  totalSessionCount: number;
}

const RESET_KEY = "acuity_funnel_reset_ts";

export default function FunnelAnalyticsTab({ start, end }: { start: string; end: string }) {
  const [showBots, setShowBots] = useState(false);
  const [sortCol, setSortCol] = useState<SortCol>("started");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [resetTs, setResetTs] = useState<string | null>(null);
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  // Load reset timestamp from localStorage
  useEffect(() => {
    try { setResetTs(localStorage.getItem(RESET_KEY)); } catch {}
  }, []);

  const extraParams = useMemo(() => {
    const p: Record<string, string> = {};
    if (showBots) p.showBots = "true";
    if (resetTs) p.resetAfter = resetTs;
    return Object.keys(p).length > 0 ? p : undefined;
  }, [showBots, resetTs]);

  const { data, loading, error, refresh } = useTabData<FunnelData>("funnel-analytics", start, end, extraParams);
  const [expandedCampaign, setExpandedCampaign] = useState<string | null>(null);
  const [expandedSession, setExpandedSession] = useState<string | null>(null);

  const handleSort = (col: SortCol) => {
    if (sortCol === col) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortCol(col); setSortDir(col === "started" ? "desc" : "asc"); }
  };

  const sortedSessions = useMemo(() => {
    if (!data) return [];
    const arr = [...data.sessions];
    const dir = sortDir === "asc" ? 1 : -1;
    arr.sort((a, b) => {
      switch (sortCol) {
        case "session": return dir * a.sessionId.localeCompare(b.sessionId);
        case "started": return dir * (new Date(a.started).getTime() - new Date(b.started).getTime());
        case "source": return dir * a.source.localeCompare(b.source);
        case "campaign": return dir * (a.campaign ?? "").localeCompare(b.campaign ?? "");
        case "step": return dir * (a.stepNumber - b.stepNumber);
        case "status": return dir * a.status.localeCompare(b.status);
        case "time": return dir * (a.timeInFunnelSec - b.timeInFunnelSec);
        default: return 0;
      }
    });
    return arr;
  }, [data, sortCol, sortDir]);

  const handleReset = () => {
    const ts = new Date().toISOString();
    try { localStorage.setItem(RESET_KEY, ts); } catch {}
    setResetTs(ts);
    setShowResetConfirm(false);
    refresh();
  };

  if (error && !data) return <TabError message={error} onRetry={refresh} />;
  if (loading || !data) return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">{Array.from({ length: 4 }).map((_, i) => <SkeletonMetric key={i} />)}</div>
      <SkeletonChart /><SkeletonTable />
    </div>
  );

  const { keyMetrics: km, funnelSteps, alerts, campaignFunnels, branchBreakdown, timePerStep, answerDistribution, dropOffAnalysis, dailyRates, activeSessions, recentPayments, campaignNames } = data;
  const cn = (id: string | null) => (id && campaignNames[id]) || id || "direct / organic";

  const fmtTime = (sec: number) => sec < 60 ? `${sec}s` : `${Math.round(sec / 60)}m`;
  const fmtDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) + ", " +
      d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
  };

  function downloadCSV() {
    const headers = ["Session ID", "Started", "Last Event", "Status", "Step", "Step #", "Time (s)", "Source", "Campaign", "Creative", "Browser"];
    const rows = (data?.sessions ?? []).map((s) => [
      s.sessionId, s.started, s.lastEvent, s.status, s.currentStep,
      s.stepNumber, s.timeInFunnelSec, s.source, cn(s.campaign), s.creative ?? "", s.browser ?? "",
    ]);
    const csv = [headers, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `funnel-sessions-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
  }

  const timeColor = (sec: number) => sec <= 10 ? "bg-emerald-500" : sec <= 30 ? "bg-amber-500" : "bg-red-500";
  const gapColor = (sec: number) => sec > 40 ? "text-red-400" : sec > 20 ? "text-amber-400" : "text-white/30";

  return (
    <div className="space-y-6">

      {/* ── Real-time Indicator + Reset ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className={`inline-block h-2.5 w-2.5 rounded-full ${activeSessions > 0 ? "bg-emerald-400 animate-pulse" : "bg-white/20"}`} />
            <span className="text-xs text-white/50">
              {activeSessions > 0 ? `${activeSessions} in funnel now` : "No active sessions"}
            </span>
          </div>
          {recentPayments.length > 0 && (
            <span className="text-xs text-emerald-400 font-medium">
              Last payment: {recentPayments[0].branch} branch{recentPayments[0].campaign !== "direct" ? `, ${cn(recentPayments[0].campaign)}` : ""}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {data.effectiveStart && (
            <span className="text-[10px] text-white/30">
              Metrics since {fmtDate(data.effectiveStart)}
            </span>
          )}
          <button onClick={() => setShowResetConfirm(true)}
            className="text-[10px] text-white/30 hover:text-white/60 transition border border-white/10 rounded px-2 py-1">
            Reset Metrics
          </button>
        </div>
      </div>

      {/* Reset confirmation */}
      {showResetConfirm && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3 flex items-center justify-between">
          <p className="text-xs text-amber-300">Reset all funnel metrics? Old data won&rsquo;t be deleted but will be excluded from all dashboards.</p>
          <div className="flex gap-2 shrink-0 ml-4">
            <button onClick={() => setShowResetConfirm(false)} className="text-xs text-white/40 hover:text-white/60 px-3 py-1">Cancel</button>
            <button onClick={handleReset} className="text-xs bg-amber-500 text-black font-semibold rounded px-3 py-1 hover:bg-amber-400">Confirm Reset</button>
          </div>
        </div>
      )}

      {/* ── Key Metrics ── */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <MetricCard label="Total Sessions" value={String(km.totalSessions)} sub={`${km.todaySessions} today`} />
        <MetricCard label="Funnel Completion" value={`${km.completionRate}%`} sub="Entry &rarr; Paid" color={km.completionRate >= 5 ? "text-emerald-400" : "text-red-400"} />
        <MetricCard label="Biggest Drop-off" value={km.biggestDrop.step} sub={`${km.biggestDrop.dropPct}% lost`} color="text-amber-400" />
        <MetricCard label="Avg Funnel Time" value={fmtTime(km.avgFunnelTimeSec)} sub="completed sessions" />
      </div>

      {/* ── Daily Completion Rate ── */}
      {dailyRates.length > 0 && (
        <div className="rounded-xl bg-[#13131F] p-6">
          <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-white/40">Daily Completion Rate</h3>
          <div className="flex items-end gap-1 h-24">
            {dailyRates.slice(-30).map((d) => {
              const h = Math.max(2, d.rate * 2);
              return (
                <div key={d.date} className="flex-1 flex flex-col items-center justify-end gap-1" title={`${d.date}: ${d.entry} sessions, ${d.paid} paid (${d.rate}%)`}>
                  <span className="text-[8px] text-white/30 tabular-nums">{d.rate > 0 ? `${d.rate}%` : ""}</span>
                  <div className={`w-full rounded-t ${d.rate >= 5 ? "bg-emerald-500" : d.rate > 0 ? "bg-amber-500" : "bg-white/10"}`} style={{ height: `${h}px` }} />
                </div>
              );
            })}
          </div>
          <div className="flex justify-between mt-2">
            <span className="text-[9px] text-white/20">{dailyRates[Math.max(0, dailyRates.length - 30)]?.date}</span>
            <span className="text-[9px] text-white/20">{dailyRates[dailyRates.length - 1]?.date}</span>
          </div>
        </div>
      )}

      {/* ── Alerts ── */}
      {alerts.length > 0 && (
        <div className="space-y-2">
          {alerts.map((a, i) => (
            <div key={i} className="rounded-lg border border-red-500/20 bg-red-500/5 px-4 py-2.5 flex items-center gap-3">
              <span className="text-red-400 text-sm font-semibold shrink-0">{a.step}: {a.conversion}%</span>
              <span className="text-red-300/70 text-xs">{a.suggestion}</span>
            </div>
          ))}
        </div>
      )}

      {/* ── Conversion Funnel ── */}
      <div className="rounded-xl bg-[#13131F] p-6">
        <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-white/40">Conversion Funnel</h3>
        <div className="space-y-2">
          {funnelSteps.map((s, i) => {
            const barColor = s.color === "green" ? "bg-emerald-500" : s.color === "yellow" ? "bg-amber-500" : "bg-red-500";
            const maxCount = funnelSteps[0]?.count || 1;
            const barWidth = Math.max(2, (s.count / maxCount) * 100);
            return (
              <div key={s.key} className="flex items-center gap-3">
                <span className="text-xs text-white/50 w-24 shrink-0 text-right">{s.label}</span>
                <div className="flex-1 h-7 bg-white/5 rounded overflow-hidden relative">
                  <div className={`h-full ${barColor} rounded transition-all duration-500`} style={{ width: `${barWidth}%` }} />
                  <span className="absolute inset-0 flex items-center px-2 text-xs font-medium text-white">{s.count}</span>
                </div>
                <div className="w-28 shrink-0 text-right">
                  {i > 0 && (
                    <span className={`text-xs font-medium ${s.color === "green" ? "text-emerald-400" : s.color === "yellow" ? "text-amber-400" : "text-red-400"}`}>
                      {s.stepConversion}%
                    </span>
                  )}
                  <span className="text-[10px] text-white/30 ml-2">{s.overallConversion}% total</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Time Per Step ── */}
      {timePerStep.length > 0 && timePerStep.some((t) => t.samples > 0) && (
        <div className="rounded-xl bg-[#13131F] p-6">
          <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-white/40">Time Per Step (Median)</h3>
          <div className="space-y-1.5">
            {timePerStep.filter((t) => t.samples > 0).map((t) => {
              const barW = Math.min(100, Math.max(3, (t.medianSec / 60) * 100));
              return (
                <div key={t.key} className="flex items-center gap-3">
                  <span className="text-xs text-white/50 w-24 shrink-0 text-right">{t.step}</span>
                  <div className="flex-1 h-5 bg-white/5 rounded overflow-hidden relative">
                    <div className={`h-full ${timeColor(t.medianSec)} rounded`} style={{ width: `${barW}%` }} />
                  </div>
                  <span className="text-xs text-white/50 w-12 shrink-0 tabular-nums">{t.medianSec}s</span>
                </div>
              );
            })}
          </div>
          <div className="flex gap-4 mt-3 text-[9px] text-white/30">
            <span><span className="inline-block h-2 w-2 rounded bg-emerald-500 mr-1" />&lt;10s</span>
            <span><span className="inline-block h-2 w-2 rounded bg-amber-500 mr-1" />10-30s</span>
            <span><span className="inline-block h-2 w-2 rounded bg-red-500 mr-1" />&gt;30s</span>
          </div>
        </div>
      )}

      {/* ── Answer Distribution ── */}
      {answerDistribution.length > 0 && (
        <div className="rounded-xl bg-[#13131F] p-6">
          <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-white/40">Answer Distribution</h3>
          <div className="space-y-5">
            {answerDistribution.map((q) => (
              <div key={q.question}>
                <p className="text-xs text-white/60 font-medium mb-2">{q.question}</p>
                <div className="space-y-1">
                  {q.answers.map((a) => (
                    <div key={a.answer} className="flex items-center gap-2">
                      <div className="flex-1 h-4 bg-white/5 rounded overflow-hidden relative">
                        <div className="h-full bg-[#7C5CFC]/60 rounded" style={{ width: `${a.pct}%` }} />
                        <span className="absolute inset-0 flex items-center px-2 text-[10px] text-white/70 truncate">{a.answer}</span>
                      </div>
                      <span className="text-[10px] text-white/40 w-14 shrink-0 text-right tabular-nums">{a.count} ({a.pct}%)</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Drop-off Analysis ── */}
      {dropOffAnalysis.length > 0 && (
        <div className="rounded-xl bg-[#13131F] p-6">
          <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-white/40">Drop-off Analysis</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-white/10 text-white/30 text-xs uppercase tracking-wider">
                  <th className="pb-2 pr-3">Drop Screen</th>
                  <th className="pb-2 pr-3 text-right">Count</th>
                  <th className="pb-2 pr-3">Top Branch</th>
                  <th className="pb-2 pr-3 text-right">Avg Time on Screen</th>
                </tr>
              </thead>
              <tbody>
                {dropOffAnalysis.map((d) => (
                  <tr key={d.step} className="border-b border-white/5 text-white/60">
                    <td className="py-2 pr-3 text-xs">{d.step}</td>
                    <td className="py-2 pr-3 text-xs text-right tabular-nums font-medium text-red-400">{d.count}</td>
                    <td className="py-2 pr-3 text-xs capitalize">{d.topBranch}</td>
                    <td className={`py-2 pr-3 text-xs text-right tabular-nums ${d.avgTimeSec > 30 ? "text-red-400" : d.avgTimeSec > 15 ? "text-amber-400" : "text-white/50"}`}>
                      {fmtTime(d.avgTimeSec)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Branch Conversion Comparison ── */}
      {branchBreakdown.length > 0 && (
        <div className="rounded-xl bg-[#13131F] p-6">
          <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-white/40">Branch Conversion Comparison</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-white/10 text-white/30 text-xs uppercase tracking-wider">
                  <th className="pb-2 pr-3">Branch</th>
                  <th className="pb-2 pr-3 text-right">Sessions</th>
                  <th className="pb-2 pr-3 text-right">Entry&rarr;Q4</th>
                  <th className="pb-2 pr-3 text-right">Q4&rarr;Mirror</th>
                  <th className="pb-2 pr-3 text-right">Mirror&rarr;Commit</th>
                  <th className="pb-2 pr-3 text-right">Commit&rarr;Paywall</th>
                  <th className="pb-2 pr-3 text-right">Paywall&rarr;Paid</th>
                  <th className="pb-2 pr-3 text-right">Overall</th>
                </tr>
              </thead>
              <tbody>
                {branchBreakdown.map((b) => {
                  const pct = (n: number, d: number) => d > 0 ? `${Math.round((n / d) * 100)}%` : "\u2014";
                  return (
                    <tr key={b.branch} className="border-b border-white/5 text-white/60">
                      <td className="py-2 pr-3 text-xs capitalize font-medium">{b.branch}</td>
                      <td className="py-2 pr-3 text-xs text-right tabular-nums">{b.sessions}</td>
                      <td className="py-2 pr-3 text-xs text-right tabular-nums">{pct(b.entryToQ4, b.sessions)}</td>
                      <td className="py-2 pr-3 text-xs text-right tabular-nums">{pct(b.q4ToMirror, b.entryToQ4)}</td>
                      <td className="py-2 pr-3 text-xs text-right tabular-nums">{pct(b.mirrorToCommit, b.q4ToMirror)}</td>
                      <td className="py-2 pr-3 text-xs text-right tabular-nums">{pct(b.commitToPaywall, b.mirrorToCommit)}</td>
                      <td className="py-2 pr-3 text-xs text-right tabular-nums">{pct(b.paywallToPaid, b.commitToPaywall)}</td>
                      <td className={`py-2 pr-3 text-xs text-right font-medium ${b.overallRate >= 5 ? "text-emerald-400" : b.overallRate > 0 ? "text-amber-400" : "text-red-400"}`}>
                        {b.overallRate}%
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Campaign Funnels ── */}
      <div className="rounded-xl bg-[#13131F] p-6">
        <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-white/40">Campaign Funnels</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-white/10 text-white/30 text-xs uppercase tracking-wider">
                <th className="pb-2 pr-3">Campaign</th>
                <th className="pb-2 pr-3 text-right">Sessions</th>
                <th className="pb-2 pr-3 text-right">Q2</th>
                <th className="pb-2 pr-3 text-right">Mirror</th>
                <th className="pb-2 pr-3 text-right">Commit</th>
                <th className="pb-2 pr-3 text-right">Signup</th>
                <th className="pb-2 pr-3 text-right">Paid</th>
                <th className="pb-2 pr-3 text-right">Rate</th>
                <th className="pb-2 pr-3 text-right">Avg Time</th>
              </tr>
            </thead>
            <tbody>
              {campaignFunnels.map((cf) => (
                <React.Fragment key={cf.campaign}>
                  <tr className="border-b border-white/5 text-white/60 hover:bg-white/[0.02] cursor-pointer"
                    onClick={() => setExpandedCampaign(expandedCampaign === cf.campaign ? null : cf.campaign)}>
                    <td className="py-2 pr-3 text-xs truncate max-w-[200px]" title={cf.campaign}>{cn(cf.campaign)}</td>
                    <td className="py-2 pr-3 text-xs text-right tabular-nums">{cf.sessions}</td>
                    <td className="py-2 pr-3 text-xs text-right tabular-nums">{cf.steps.branch_q2 ?? 0}</td>
                    <td className="py-2 pr-3 text-xs text-right tabular-nums">{cf.steps.mirror ?? 0}</td>
                    <td className="py-2 pr-3 text-xs text-right tabular-nums">{cf.steps.commit ?? 0}</td>
                    <td className="py-2 pr-3 text-xs text-right tabular-nums">{cf.steps.signup ?? 0}</td>
                    <td className="py-2 pr-3 text-xs text-right tabular-nums">{cf.steps.paid ?? 0}</td>
                    <td className={`py-2 pr-3 text-xs text-right font-medium ${cf.conversionRate >= 5 ? "text-emerald-400" : cf.conversionRate > 0 ? "text-amber-400" : "text-red-400"}`}>
                      {cf.conversionRate}%
                    </td>
                    <td className="py-2 pr-3 text-xs text-right tabular-nums">{cf.avgTimeSec > 0 ? fmtTime(cf.avgTimeSec) : "\u2014"}</td>
                  </tr>
                  {expandedCampaign === cf.campaign && (
                    <tr>
                      <td colSpan={9} className="p-0">
                        <div className="bg-[#0D0D17] border-b border-white/10 px-4 py-3 space-y-3">
                          {Object.keys(cf.diagnosticDistribution).length > 0 && (
                            <div>
                              <p className="text-[10px] text-white/40 uppercase tracking-wider mb-1">Answers</p>
                              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                {Object.entries(cf.diagnosticDistribution).map(([q, dist]) => (
                                  <div key={q} className="text-[10px]">
                                    <span className="text-white/50 font-medium">{q}:</span>
                                    {Object.entries(dist).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([answer, count]) => (
                                      <span key={answer} className="ml-1 text-white/30">{answer} ({count})</span>
                                    ))}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                          {cf.creatives.length > 0 && (
                            <div>
                              <p className="text-[10px] text-white/40 uppercase tracking-wider mb-1">Creatives</p>
                              <div className="space-y-1">
                                {cf.creatives.map((c) => (
                                  <div key={c.creativeId} className="flex items-center gap-3 text-[10px]">
                                    <span className="font-mono text-white/40 w-20 truncate">{c.creativeId.slice(0, 8)}</span>
                                    <span className="text-white/50">{c.sessions} sessions</span>
                                    <span className="text-white/30">max step {c.maxStep}</span>
                                    <span className={c.convRate > 0 ? "text-emerald-400" : "text-white/30"}>{c.convRate}% conv</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Live Sessions ── */}
      <div className="rounded-xl bg-[#13131F] p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-white/40">
            Sessions ({data.totalSessionCount})
          </h3>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <span className="text-xs text-white/30">Show bots</span>
              <button role="switch" aria-checked={showBots} onClick={() => setShowBots((v) => !v)}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${showBots ? "bg-[#7C5CFC]" : "bg-white/10"}`}>
                <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${showBots ? "translate-x-[18px]" : "translate-x-[3px]"}`} />
              </button>
            </label>
            <button onClick={downloadCSV}
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs text-[#A0A0B8] hover:text-white hover:border-white/20 transition">
              Download CSV
            </button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-white/10 text-white/30 text-xs uppercase tracking-wider">
                {([
                  ["session", "Session"], ["started", "Started"], ["source", "Source"],
                  ["campaign", "Campaign"], ["step", "Step"], ["status", "Status"], ["time", "Time"],
                ] as [SortCol, string][]).map(([col, label]) => (
                  <th key={col} className="pb-2 pr-3 cursor-pointer hover:text-white/60 transition select-none" onClick={() => handleSort(col)}>
                    {label}
                    {sortCol === col && <span className="ml-1 text-[10px]">{sortDir === "asc" ? "\u25B2" : "\u25BC"}</span>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedSessions.map((s) => {
                const statusColors: Record<string, string> = {
                  completed: "text-emerald-400", paid: "text-emerald-400",
                  active: "text-blue-400", stalled: "text-amber-400", dropped: "text-red-400",
                };
                return (
                  <React.Fragment key={s.sessionId}>
                    <tr className="border-b border-white/5 text-white/60 hover:bg-white/[0.02] cursor-pointer"
                      onClick={() => setExpandedSession(expandedSession === s.sessionId ? null : s.sessionId)}>
                      <td className="py-2 pr-3 font-mono text-xs">{s.sessionId}</td>
                      <td className="py-2 pr-3 text-xs text-white/40 whitespace-nowrap">{fmtDate(s.started)}</td>
                      <td className="py-2 pr-3 text-xs">{s.source}</td>
                      <td className="py-2 pr-3 text-xs truncate max-w-[120px]" title={s.campaign ?? ""}>{cn(s.campaign)}</td>
                      <td className="py-2 pr-3">
                        <div className="flex items-center gap-2">
                          <div className="w-16 h-1 rounded-full bg-white/10 overflow-hidden">
                            <div className="h-full rounded-full bg-[#7C5CFC]" style={{ width: `${(s.stepNumber / 18) * 100}%` }} />
                          </div>
                          <span className="text-xs">{s.currentStep}</span>
                        </div>
                      </td>
                      <td className={`py-2 pr-3 text-xs font-medium capitalize ${statusColors[s.status] ?? ""}`}>{s.status}</td>
                      <td className="py-2 pr-3 text-xs tabular-nums">{fmtTime(s.timeInFunnelSec)}</td>
                    </tr>
                    {/* ── Session Replay (expanded) ── */}
                    {expandedSession === s.sessionId && (
                      <tr>
                        <td colSpan={7} className="p-0">
                          <div className="bg-[#0D0D17] border-b border-white/10 px-4 py-3">
                            {Object.keys(s.diagnosticAnswers).length > 0 && (
                              <div className="flex gap-4 text-[10px] text-white/40 mb-3 flex-wrap">
                                {s.browser && <span>Browser: {s.browser}</span>}
                                {s.diagnosticAnswers.entry && <span>Branch: {s.diagnosticAnswers.entry}</span>}
                              </div>
                            )}
                            <div className="space-y-0.5">
                              {s.events.map((ev, idx) => {
                                const evTime = new Date(ev.createdAt);
                                const prevTime = idx > 0 ? new Date(s.events[idx - 1].createdAt) : null;
                                const gap = prevTime ? Math.round((evTime.getTime() - prevTime.getTime()) / 1000) : 0;
                                const isLast = idx === s.events.length - 1 && (s.status === "dropped" || s.status === "stalled");
                                const label = ev.event.replace("funnel_", "").replace(/_/g, " ");
                                return (
                                  <div key={idx} className={`flex items-center gap-3 text-[10px] ${isLast ? "bg-red-500/5 -mx-1 px-1 rounded" : ""}`}>
                                    <span className="text-white/30 tabular-nums w-20 shrink-0">
                                      {evTime.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit", hour12: true })}
                                    </span>
                                    {idx > 0 ? (
                                      <span className={`w-10 shrink-0 text-right tabular-nums font-medium ${gapColor(gap)}`}>+{gap}s</span>
                                    ) : (
                                      <span className="w-10 shrink-0" />
                                    )}
                                    <span className="text-white/60">{label}</span>
                                    {ev.value && <span className="text-[#7C5CFC]/70 truncate max-w-[200px]">{ev.value}</span>}
                                    {isLast && <span className="text-red-400 font-medium ml-auto">DROPPED</span>}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function MetricCard({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="rounded-xl bg-[#13131F] p-5">
      <p className="text-[10px] font-medium uppercase tracking-wider text-white/40 mb-1">{label}</p>
      <p className={`text-2xl font-bold tabular-nums ${color ?? "text-white"}`}>{value}</p>
      {sub && <p className="text-xs text-white/30 mt-0.5" dangerouslySetInnerHTML={{ __html: sub }} />}
    </div>
  );
}
