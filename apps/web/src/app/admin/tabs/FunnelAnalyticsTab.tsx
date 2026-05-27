"use client";

import React, { useMemo, useState } from "react";
import { useTabData } from "./useTabData";
import { TabError } from "../components/TabError";
import { SkeletonMetric, SkeletonChart, SkeletonTable } from "../components/SkeletonCard";

type SortCol = "session" | "started" | "source" | "campaign" | "step" | "status" | "time";
type SortDir = "asc" | "desc";

interface FunnelStep {
  key: string; label: string; count: number;
  stepConversion: number; overallConversion: number; color: string;
}
interface Alert { step: string; conversion: number; suggestion: string; }
interface CampaignFunnel {
  campaign: string; sessions: number;
  steps: { diagnostic: number; mirror: number; commitment: number; signup: number; paid: number };
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
  branch: string; sessions: number; mirror: number; commit: number; paywall: number; paid: number; convRate: number;
}
interface FunnelData {
  keyMetrics: { totalSessions: number; todaySessions: number; completionRate: number; biggestDrop: { step: string; dropPct: number }; avgFunnelTimeSec: number };
  funnelSteps: FunnelStep[];
  alerts: Alert[];
  campaignFunnels: CampaignFunnel[];
  branchBreakdown?: BranchRow[];
  sessions: SessionRow[];
  totalSessionCount: number;
}

export default function FunnelAnalyticsTab({ start, end }: { start: string; end: string }) {
  const [showBots, setShowBots] = useState(false);
  const [sortCol, setSortCol] = useState<SortCol>("started");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const extraParams = useMemo(() => (showBots ? { showBots: "true" } : undefined), [showBots]);
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

  if (error && !data) return <TabError message={error} onRetry={refresh} />;
  if (loading || !data) return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">{Array.from({ length: 4 }).map((_, i) => <SkeletonMetric key={i} />)}</div>
      <SkeletonChart /><SkeletonTable />
    </div>
  );

  const { keyMetrics: km, funnelSteps, alerts, campaignFunnels, sessions } = data;

  function downloadCSV() {
    const headers = ["Session ID", "Started", "Last Event", "Status", "Step", "Step #", "Time (s)", "Source", "Campaign", "Creative", "Browser"];
    const rows = sessions.map((s) => [
      s.sessionId, s.started, s.lastEvent, s.status, s.currentStep,
      s.stepNumber, s.timeInFunnelSec, s.source, s.campaign ?? "", s.creative ?? "", s.browser ?? "",
    ]);
    const csv = [headers, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `funnel-sessions-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
  }

  const fmtTime = (sec: number) => sec < 60 ? `${sec}s` : `${Math.round(sec / 60)}m`;
  const fmtDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) + ", " +
      d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
  };

  return (
    <div className="space-y-6">
      {/* ── Key Metrics ── */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <MetricCard label="Total Sessions" value={String(km.totalSessions)} sub={`${km.todaySessions} today`} />
        <MetricCard label="Funnel Completion" value={`${km.completionRate}%`} sub="Pain Hook → Paid" color={km.completionRate >= 5 ? "text-emerald-400" : "text-red-400"} />
        <MetricCard label="Biggest Drop-off" value={km.biggestDrop.step} sub={`${km.biggestDrop.dropPct}% lost`} color="text-amber-400" />
        <MetricCard label="Avg Funnel Time" value={fmtTime(km.avgFunnelTimeSec)} sub="completed sessions" />
      </div>

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
                  <span className="absolute inset-0 flex items-center px-2 text-xs font-medium text-white">
                    {s.count}
                  </span>
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

      {/* ── Campaign Funnels ── */}
      <div className="rounded-xl bg-[#13131F] p-6">
        <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-white/40">Campaign Funnels</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-white/10 text-white/30 text-xs uppercase tracking-wider">
                <th className="pb-2 pr-3">Campaign</th>
                <th className="pb-2 pr-3 text-right">Sessions</th>
                <th className="pb-2 pr-3 text-right">Diag</th>
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
                    <td className="py-2 pr-3 text-xs truncate max-w-[200px]" title={cf.campaign}>{cf.campaign}</td>
                    <td className="py-2 pr-3 text-xs text-right tabular-nums">{cf.sessions}</td>
                    <td className="py-2 pr-3 text-xs text-right tabular-nums">{cf.steps.diagnostic}</td>
                    <td className="py-2 pr-3 text-xs text-right tabular-nums">{cf.steps.mirror}</td>
                    <td className="py-2 pr-3 text-xs text-right tabular-nums">{cf.steps.commitment}</td>
                    <td className="py-2 pr-3 text-xs text-right tabular-nums">{cf.steps.signup}</td>
                    <td className="py-2 pr-3 text-xs text-right tabular-nums">{cf.steps.paid}</td>
                    <td className={`py-2 pr-3 text-xs text-right font-medium ${cf.conversionRate >= 5 ? "text-emerald-400" : cf.conversionRate > 0 ? "text-amber-400" : "text-red-400"}`}>
                      {cf.conversionRate}%
                    </td>
                    <td className="py-2 pr-3 text-xs text-right tabular-nums">{cf.avgTimeSec > 0 ? fmtTime(cf.avgTimeSec) : "—"}</td>
                  </tr>
                  {expandedCampaign === cf.campaign && (
                    <tr>
                      <td colSpan={9} className="p-0">
                        <div className="bg-[#0D0D17] border-b border-white/10 px-4 py-3 space-y-3">
                          {/* Diagnostic distribution */}
                          {Object.keys(cf.diagnosticDistribution).length > 0 && (
                            <div>
                              <p className="text-[10px] text-white/40 uppercase tracking-wider mb-1">Diagnostic Answers</p>
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
                          {/* Per-creative breakdown */}
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

      {/* ── Branch Breakdown ── */}
      {data.branchBreakdown && data.branchBreakdown.length > 0 && (
        <div className="rounded-xl bg-[#13131F] p-6">
          <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-white/40">Branch Breakdown</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-white/10 text-white/30 text-xs uppercase tracking-wider">
                  <th className="pb-2 pr-3">Branch</th>
                  <th className="pb-2 pr-3 text-right">Sessions</th>
                  <th className="pb-2 pr-3 text-right">&rarr; Mirror</th>
                  <th className="pb-2 pr-3 text-right">&rarr; Commit</th>
                  <th className="pb-2 pr-3 text-right">&rarr; Paywall</th>
                  <th className="pb-2 pr-3 text-right">&rarr; Paid</th>
                  <th className="pb-2 pr-3 text-right">Rate</th>
                </tr>
              </thead>
              <tbody>
                {data.branchBreakdown.map((b) => (
                  <tr key={b.branch} className="border-b border-white/5 text-white/60">
                    <td className="py-2 pr-3 text-xs capitalize">{b.branch}</td>
                    <td className="py-2 pr-3 text-xs text-right tabular-nums">{b.sessions}</td>
                    <td className="py-2 pr-3 text-xs text-right tabular-nums">{b.mirror}</td>
                    <td className="py-2 pr-3 text-xs text-right tabular-nums">{b.commit}</td>
                    <td className="py-2 pr-3 text-xs text-right tabular-nums">{b.paywall}</td>
                    <td className="py-2 pr-3 text-xs text-right tabular-nums">{b.paid}</td>
                    <td className={`py-2 pr-3 text-xs text-right font-medium ${b.convRate >= 5 ? "text-emerald-400" : b.convRate > 0 ? "text-amber-400" : "text-red-400"}`}>
                      {b.convRate}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Live Sessions ── */}
      <div className="rounded-xl bg-[#13131F] p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-white/40">
            Sessions ({data.totalSessionCount})
          </h3>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <span className="text-xs text-white/30">Show bots</span>
              <button
                role="switch" aria-checked={showBots}
                onClick={() => setShowBots((v) => !v)}
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
                  <th key={col}
                    className="pb-2 pr-3 cursor-pointer hover:text-white/60 transition select-none"
                    onClick={() => handleSort(col)}>
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
                      <td className="py-2 pr-3 text-xs truncate max-w-[120px]" title={s.campaign ?? ""}>{s.campaign ?? "—"}</td>
                      <td className="py-2 pr-3">
                        <div className="flex items-center gap-2">
                          <div className="w-16 h-1 rounded-full bg-white/10 overflow-hidden">
                            <div className="h-full rounded-full bg-[#7C5CFC]" style={{ width: `${(s.stepNumber / 16) * 100}%` }} />
                          </div>
                          <span className="text-xs">{s.currentStep}</span>
                        </div>
                      </td>
                      <td className={`py-2 pr-3 text-xs font-medium capitalize ${statusColors[s.status] ?? ""}`}>{s.status}</td>
                      <td className="py-2 pr-3 text-xs tabular-nums">{fmtTime(s.timeInFunnelSec)}</td>
                    </tr>
                    {expandedSession === s.sessionId && (
                      <tr>
                        <td colSpan={7} className="p-0">
                          <div className="bg-[#0D0D17] border-b border-white/10 px-4 py-3 space-y-2">
                            <div className="flex gap-6 text-[10px] text-white/40 mb-2 flex-wrap">
                              {s.browser && <span>Browser: {s.browser}</span>}
                              {Object.keys(s.diagnosticAnswers).length > 0 && (
                                <span>Diagnostics: {Object.entries(s.diagnosticAnswers).map(([k, v]) => `${k}=${v}`).join(", ")}</span>
                              )}
                            </div>
                            <div className="space-y-0.5">
                              {s.events.map((ev, idx) => {
                                const evTime = new Date(ev.createdAt);
                                const prevTime = idx > 0 ? new Date(s.events[idx - 1].createdAt) : null;
                                const gap = prevTime ? Math.round((evTime.getTime() - prevTime.getTime()) / 1000) : 0;
                                return (
                                  <div key={idx} className="flex items-center gap-3 text-[10px]">
                                    <span className="text-white/30 tabular-nums w-24 shrink-0">
                                      {evTime.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit", hour12: true })}
                                    </span>
                                    {idx > 0 ? <span className="text-white/20 w-10 shrink-0 text-right">+{gap}s</span> : <span className="w-10 shrink-0" />}
                                    <span className="text-white/60 font-mono">{ev.event.replace("funnel_", "")}</span>
                                    {ev.value && <span className="text-[#7C5CFC]/70">{ev.value}</span>}
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
      {sub && <p className="text-xs text-white/30 mt-0.5">{sub}</p>}
    </div>
  );
}
