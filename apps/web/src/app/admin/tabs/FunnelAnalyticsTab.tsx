"use client";

import { useState, useEffect } from "react";

export default function FunnelAnalyticsTab({ start, end }: { start: string; end: string }) {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [sortCol, setSortCol] = useState("started");
  const [sortDir, setSortDir] = useState(-1);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showPageLoadOnly, setShowPageLoadOnly] = useState(false);
  const [flowVersion, setFlowVersion] = useState<"v3" | "v2" | "v1" | "all">("v3");

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(`/api/admin/metrics?tab=funnel-analytics&start=${start}&end=${end}&flow=${flowVersion}`)
      .then((r) => { if (!r.ok) throw new Error(`${r.status}`); return r.json(); })
      .then((d) => { setData(d); setLoading(false); })
      .catch((e) => { setError(e.message); setLoading(false); });
  }, [start, end, flowVersion]);

  if (loading) return <div style={{ color: "#888", padding: 40, textAlign: "center" }}>Loading funnel data...</div>;
  if (error) return (
    <div style={{ color: "#ef4444", padding: 40, textAlign: "center" }}>
      Error: {error}
      <button onClick={() => window.location.reload()} style={{ marginLeft: 12, background: "#7C5CFC", color: "#fff", border: "none", borderRadius: 6, padding: "6px 16px", cursor: "pointer" }}>Retry</button>
    </div>
  );
  if (!data) return <div style={{ color: "#888", padding: 40, textAlign: "center" }}>No data</div>;

  const km = data.keyMetrics || {};
  const steps = data.funnelSteps || [];
  const sessions = data.sessions || [];
  const campaigns = data.campaignFunnels || [];
  const branches = data.branchBreakdown || [];
  const dropOffs = data.dropOffAnalysis || [];
  const names = data.campaignNames || {};

  const diag = data.diagnostics || {};
  const cn = (id: string | null) => (id && names[id]) || id || "direct";
  const fmt = (s: number) => s < 60 ? `${s}s` : `${Math.round(s / 60)}m`;

  // Filter sessions: by default only show interacted sessions
  const filteredSessions = showPageLoadOnly ? sessions : sessions.filter((s: any) => s.hasInteracted);

  // Simple client-side sort — no useMemo, just a sorted copy
  const sorted = [...filteredSessions].sort((a: any, b: any) => {
    const av = sortCol === "started" ? new Date(a.started).getTime()
      : sortCol === "step" ? a.stepNumber
      : sortCol === "time" ? a.timeInFunnelSec
      : sortCol === "click" ? (a.click ?? "")
      : String(a[sortCol] || "");
    const bv = sortCol === "started" ? new Date(b.started).getTime()
      : sortCol === "step" ? b.stepNumber
      : sortCol === "time" ? b.timeInFunnelSec
      : sortCol === "click" ? (b.click ?? "")
      : String(b[sortCol] || "");
    return typeof av === "number" ? sortDir * (av - bv) : sortDir * String(av).localeCompare(String(bv));
  });

  const toggleSort = (col: string) => {
    if (sortCol === col) setSortDir((d) => d * -1);
    else { setSortCol(col); setSortDir(col === "started" ? -1 : 1); }
  };

  const S: React.CSSProperties = { background: "#13131F", borderRadius: 12, padding: 20, marginBottom: 20 };
  const H: React.CSSProperties = { fontSize: 11, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.1em", color: "rgba(255,255,255,0.3)", marginBottom: 12 };
  const TH: React.CSSProperties = { padding: "6px 8px", fontSize: 11, color: "rgba(255,255,255,0.3)", borderBottom: "1px solid rgba(255,255,255,0.08)", cursor: "pointer", userSelect: "none" as const };
  const TD: React.CSSProperties = { padding: "6px 8px", fontSize: 12, color: "rgba(255,255,255,0.5)", borderBottom: "1px solid rgba(255,255,255,0.04)" };

  // CSV export
  const downloadCsv = () => {
    const rows = [["Session", "Started", "Source", "Campaign", "Step", "Click", "Status", "Time (s)", "Interacted"]];
    for (const s of filteredSessions) {
      rows.push([s.sessionId, s.started, s.source, cn(s.campaign), s.currentStep, s.click ?? "", s.status, String(s.timeInFunnelSec), s.hasInteracted ? "yes" : "no"]);
    }
    const csv = rows.map((r: string[]) => r.map((c: string) => `"${(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `funnel-sessions-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", gap: 4 }}>
          {(["v3", "v2", "v1", "all"] as const).map((v) => (
            <button key={v} onClick={() => setFlowVersion(v)}
              style={{ padding: "4px 10px", fontSize: 11, fontWeight: 600, borderRadius: 6, border: "none", cursor: "pointer",
                background: flowVersion === v ? "#7C5CFC" : "rgba(255,255,255,0.06)",
                color: flowVersion === v ? "#fff" : "rgba(255,255,255,0.35)" }}>
              {v === "all" ? "All" : v.toUpperCase()}
            </button>
          ))}
        </div>
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.25)" }}>
          {new Date(start).toLocaleDateString("en-US", { month: "short", day: "numeric" })} — {new Date(end).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
        </div>
      </div>

      {/* Account → Paid summary */}
      {(km.totalAccounts ?? 0) > 0 && (
        <div style={{ ...S, display: "flex", alignItems: "center", gap: 16, padding: "14px 20px" }}>
          <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "rgba(255,255,255,0.3)" }}>Total Accounts:</span>
          <span style={{ fontSize: 20, fontWeight: 700, color: "#fff" }}>{km.totalAccounts}</span>
          <span style={{ fontSize: 16, color: "rgba(255,255,255,0.2)" }}>→</span>
          <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "rgba(255,255,255,0.3)" }}>Paid (Stripe, all versions):</span>
          <span style={{ fontSize: 20, fontWeight: 700, color: "#22c55e" }}>{km.totalPaid}</span>
          <span style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", fontWeight: 600 }}>
            ({km.paidConversion ?? 0}% of new accounts have paid)
          </span>
          <span style={{ flex: 1 }} />
          <span style={{ fontSize: 11, color: "rgba(255,255,255,0.25)" }}>
            {km.totalTrialContinued ?? 0} continued on trial
          </span>
        </div>
      )}

      {/* Page Load → First Tap funnel */}
      {(km.pageLoadCount ?? 0) > 0 && (
        <div style={{ ...S, display: "flex", alignItems: "center", gap: 16, padding: "14px 20px" }}>
          <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "rgba(255,255,255,0.3)" }}>Page Loads:</span>
          <span style={{ fontSize: 20, fontWeight: 700, color: "#fff" }}>{km.pageLoadCount}</span>
          <span style={{ fontSize: 16, color: "rgba(255,255,255,0.2)" }}>→</span>
          <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "rgba(255,255,255,0.3)" }}>First Tap:</span>
          <span style={{ fontSize: 20, fontWeight: 700, color: "#22c55e" }}>{km.interactedCount}</span>
          <span style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", fontWeight: 600 }}>
            ({km.pageLoadCount > 0 ? Math.round((km.interactedCount / km.pageLoadCount) * 100) : 0}%)
          </span>
          <span style={{ flex: 1 }} />
          <span style={{ fontSize: 10, color: "rgba(255,255,255,0.2)" }}>
            {(km.pageLoadCount ?? 0) - (km.interactedCount ?? 0)} bot/prefetch filtered
          </span>
        </div>
      )}

      {/* Raw event diagnostics */}
      {diag.entryViewedEvents > 0 && (
        <div style={{ ...S, padding: "10px 20px", display: "flex", gap: 20, alignItems: "center", fontSize: 11, color: "rgba(255,255,255,0.3)" }}>
          <span>Raw events: <strong style={{ color: "rgba(255,255,255,0.6)" }}>{diag.totalEventsInRange}</strong></span>
          <span>entry_viewed: <strong style={{ color: "rgba(255,255,255,0.6)" }}>{diag.entryViewedEvents}</strong></span>
          <span>entry_selected: <strong style={{ color: "rgba(255,255,255,0.6)" }}>{diag.entrySelectedEvents}</strong></span>
          <span>Tap rate: <strong style={{ color: diag.tapRate >= 50 ? "#22c55e" : diag.tapRate >= 20 ? "#f59e0b" : "#ef4444" }}>{diag.tapRate}%</strong></span>
        </div>
      )}

      {/* Key Metrics */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
        {[
          { label: "Sessions", value: km.totalSessions ?? 0, sub: `${km.todaySessions ?? 0} today` },
          { label: "Completion", value: `${km.completionRate ?? 0}%` },
          { label: "Biggest Drop", value: km.biggestDrop?.step ?? "N/A", sub: `${km.biggestDrop?.dropPct ?? 0}% lost` },
          { label: "Avg Time", value: fmt(km.avgFunnelTimeSec ?? 0) },
        ].map((m, i) => (
          <div key={i} style={S}>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "0.1em" }}>{m.label}</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: "#fff", marginTop: 4 }}>{m.value}</div>
            {m.sub && <div style={{ fontSize: 11, color: "rgba(255,255,255,0.25)", marginTop: 2 }}>{m.sub}</div>}
          </div>
        ))}
      </div>

      {/* Conversion Rates */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
        {[
          { label: "Account Creation", value: `${km.accountCreationRate ?? 0}%`, sub: "timeline → account" },
          { label: "Immediate Pay", value: `${km.immediatePayRate ?? 0}%`, sub: "account → paid" },
          { label: "Trial Skip", value: `${km.trialSkipRate ?? 0}%`, sub: "account → trial" },
          { label: "Download", value: `${km.downloadRate ?? 0}%`, sub: "account → download" },
        ].map((m, i) => (
          <div key={i} style={S}>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "0.1em" }}>{m.label}</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: "#fff", marginTop: 4 }}>{m.value}</div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.25)", marginTop: 2 }}>{m.sub}</div>
          </div>
        ))}
      </div>

      {/* Commit Completion % (7c) */}
      {(diag.commitViewedSessions ?? 0) > 0 && (
        <div style={{ ...S, display: "flex", alignItems: "center", gap: 16, padding: "14px 20px" }}>
          <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "rgba(255,255,255,0.3)" }}>Commit Screen:</span>
          <span style={{ fontSize: 20, fontWeight: 700, color: "#fff" }}>{diag.commitViewedSessions}</span>
          <span style={{ fontSize: 16, color: "rgba(255,255,255,0.2)" }}>→</span>
          <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "rgba(255,255,255,0.3)" }}>Held to Commit:</span>
          <span style={{ fontSize: 20, fontWeight: 700, color: "#22c55e" }}>{diag.commitCompletedSessions}</span>
          <span style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", fontWeight: 600 }}>
            ({diag.commitCompletionRate ?? 0}% completion)
          </span>
        </div>
      )}

      {/* Ad-match breakdown (7d) */}
      {(data.adMatchStats?.total ?? 0) > 0 && (
        <div style={{ ...S, padding: "14px 20px" }}>
          <div style={{ ...H, marginBottom: 8 }}>Banner-to-Buyer Attribution</div>
          <div style={{ display: "flex", gap: 20, fontSize: 12, color: "rgba(255,255,255,0.5)" }}>
            <span>Sessions with ad-match: <strong style={{ color: "#fff" }}>{data.adMatchStats.total}</strong></span>
            <span>Selected highlighted: <strong style={{ color: "#22c55e" }}>{data.adMatchStats.matched}</strong> ({data.adMatchStats.total > 0 ? Math.round((data.adMatchStats.matched / data.adMatchStats.total) * 100) : 0}%)</span>
            <span>Selected different: <strong style={{ color: "#f59e0b" }}>{data.adMatchStats.different}</strong></span>
            <span>Without param: <strong style={{ color: "rgba(255,255,255,0.4)" }}>{data.adMatchStats.withoutParam}</strong></span>
          </div>
        </div>
      )}

      {/* Conversion Funnel */}
      <div style={S}>
        <div style={H}>Conversion Funnel</div>
        {steps.map((s: any, i: number) => {
          const maxCount = steps[0]?.count || 1;
          const pct = Math.max(2, (s.count / maxCount) * 100);
          const color = s.color === "green" ? "#22c55e" : s.color === "yellow" ? "#f59e0b" : "#ef4444";
          return (
            <div key={s.key} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <span style={{ width: 80, textAlign: "right", fontSize: 11, color: "rgba(255,255,255,0.4)" }}>{s.label}</span>
              <div style={{ flex: 1, background: "rgba(255,255,255,0.04)", borderRadius: 4, height: 26, position: "relative", overflow: "hidden" }}>
                <div style={{ width: `${pct}%`, background: color, borderRadius: 4, height: "100%", display: "flex", alignItems: "center", paddingLeft: 8 }}>
                  <span style={{ color: "#fff", fontSize: 11, fontWeight: 600 }}>{s.count}</span>
                </div>
              </div>
              <span style={{ width: 80, textAlign: "right", fontSize: 11, color: "rgba(255,255,255,0.3)" }}>
                {i > 0 ? `${s.stepConversion}%` : ""} <span style={{ fontSize: 9, color: "rgba(255,255,255,0.2)" }}>{s.overallConversion}%</span>
              </span>
            </div>
          );
        })}

        {/* Paid (Stripe-verified) — below funnel bars */}
        {(data.stripePaid ?? []).length > 0 && (
          <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 8, padding: "10px 0", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
            <span style={{ width: 80, textAlign: "right", fontSize: 11, color: "#22c55e", fontWeight: 700 }}>Paid (Stripe)</span>
            <div style={{ flex: 1, background: "rgba(255,255,255,0.04)", borderRadius: 4, height: 26, position: "relative", overflow: "hidden" }}>
              <div style={{ width: `${Math.max(2, ((data.stripePaid?.length ?? 0) / (steps[0]?.count || 1)) * 100)}%`, background: "#22c55e", borderRadius: 4, height: "100%", display: "flex", alignItems: "center", paddingLeft: 8 }}>
                <span style={{ color: "#fff", fontSize: 11, fontWeight: 600 }}>{data.stripePaid?.length ?? 0}</span>
              </div>
            </div>
            <span style={{ width: 80, textAlign: "right", fontSize: 11, color: "rgba(255,255,255,0.3)" }}>
              {steps[0]?.count > 0 ? `${Math.round(((data.stripePaid?.length ?? 0) / steps[0].count) * 100)}%` : ""}
            </span>
          </div>
        )}
        {(data.stripePaid ?? []).length === 0 && (
          <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 8, padding: "10px 0", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
            <span style={{ width: 80, textAlign: "right", fontSize: 11, color: "rgba(255,255,255,0.3)", fontWeight: 700 }}>Paid (Stripe)</span>
            <span style={{ fontSize: 11, color: "rgba(255,255,255,0.25)" }}>0 — no Stripe subscriptions in this period</span>
          </div>
        )}
      </div>

      {/* Drop-off Analysis */}
      {dropOffs.length > 0 && (
        <div style={S}>
          <div style={H}>Drop-off Analysis</div>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr>
              <th style={TH}>Screen</th><th style={{ ...TH, textAlign: "right" }}>Count</th><th style={TH}>Top Branch</th><th style={{ ...TH, textAlign: "right" }}>Avg Time</th>
            </tr></thead>
            <tbody>
              {dropOffs.map((d: any) => (
                <tr key={d.step}>
                  <td style={TD}>{d.step}</td>
                  <td style={{ ...TD, textAlign: "right", color: "#ef4444", fontWeight: 600 }}>{d.count}</td>
                  <td style={{ ...TD, textTransform: "capitalize" }}>{d.topBranch}</td>
                  <td style={{ ...TD, textAlign: "right" }}>{fmt(d.avgTimeSec)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Branch Breakdown */}
      {branches.length > 0 && (
        <div style={S}>
          <div style={H}>Branch Conversion</div>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr>
              {["Branch", "Sessions", "E→Q4", "Q4→M", "M→Mech", "Mech→C", "C→Acct", "Acct→$", "Overall"].map((h) => (
                <th key={h} style={{ ...TH, textAlign: h === "Branch" ? "left" : "right" }}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {branches.map((b: any) => {
                const p = (n: number, d: number) => d > 0 ? `${Math.round((n / d) * 100)}%` : "—";
                return (
                  <tr key={b.branch}>
                    <td style={{ ...TD, textTransform: "capitalize", fontWeight: 500 }}>{b.branch}</td>
                    <td style={{ ...TD, textAlign: "right" }}>{b.sessions}</td>
                    <td style={{ ...TD, textAlign: "right" }}>{p(b.entryToQ4, b.sessions)}</td>
                    <td style={{ ...TD, textAlign: "right" }}>{p(b.q4ToMirror, b.entryToQ4)}</td>
                    <td style={{ ...TD, textAlign: "right" }}>{p(b.mirrorToMechanism, b.q4ToMirror)}</td>
                    <td style={{ ...TD, textAlign: "right" }}>{p(b.mechanismToCommit, b.mirrorToMechanism)}</td>
                    <td style={{ ...TD, textAlign: "right" }}>{p(b.commitToAccount, b.mechanismToCommit)}</td>
                    <td style={{ ...TD, textAlign: "right" }}>{p(b.accountToPaid, b.commitToAccount)}</td>
                    <td style={{ ...TD, textAlign: "right", fontWeight: 600, color: b.overallRate >= 5 ? "#22c55e" : b.overallRate > 0 ? "#f59e0b" : "#ef4444" }}>{b.overallRate}%</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Campaign Funnels */}
      <div style={S}>
        <div style={H}>Campaign Funnels</div>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr>
            {["Campaign", "Sessions", "Q2", "Mirror", "Commit", "Account", "Paid", "Rate"].map((h) => (
              <th key={h} style={{ ...TH, textAlign: h === "Campaign" ? "left" : "right" }}>{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {campaigns.map((cf: any) => (
              <tr key={cf.campaign}>
                <td style={{ ...TD, maxWidth: 160 }} title={cf.campaign}>{cn(cf.campaign)}</td>
                <td style={{ ...TD, textAlign: "right" }}>{cf.sessions}</td>
                <td style={{ ...TD, textAlign: "right" }}>{cf.steps?.branch_q2 ?? 0}</td>
                <td style={{ ...TD, textAlign: "right" }}>{cf.steps?.mirror ?? 0}</td>
                <td style={{ ...TD, textAlign: "right" }}>{cf.steps?.commit ?? 0}</td>
                <td style={{ ...TD, textAlign: "right" }}>{cf.steps?.account ?? 0}</td>
                <td style={{ ...TD, textAlign: "right" }}>{cf.steps?.paid ?? 0}</td>
                <td style={{ ...TD, textAlign: "right", fontWeight: 600, color: cf.conversionRate >= 5 ? "#22c55e" : cf.conversionRate > 0 ? "#f59e0b" : "#ef4444" }}>{cf.conversionRate}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Sessions */}
      <div style={S}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <div style={H as any}>Sessions ({showPageLoadOnly ? sessions.length : data.totalSessionCount ?? filteredSessions.length})</div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 11, color: "rgba(255,255,255,0.3)" }}>
              <input
                type="checkbox"
                checked={showPageLoadOnly}
                onChange={(e) => setShowPageLoadOnly(e.target.checked)}
                style={{ accentColor: "#7C5CFC" }}
              />
              Show page-load-only sessions
            </label>
            <button onClick={downloadCsv} style={{ background: "rgba(255,255,255,0.06)", border: "none", borderRadius: 6, padding: "4px 12px", fontSize: 11, color: "rgba(255,255,255,0.4)", cursor: "pointer" }}>
              Download CSV
            </button>
          </div>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr>
              {[["sessionId","Session"],["started","Started"],["source","Source"],["campaign","Campaign"],["step","Step"],["click","Click"],["status","Status"],["time","Time"]].map(([col, label]) => (
                <th key={col} onClick={() => toggleSort(col)} style={TH}>{label}{sortCol === col ? (sortDir === 1 ? " ▲" : " ▼") : ""}</th>
              ))}
            </tr></thead>
            <tbody>
              {sorted.slice(0, 100).map((s: any) => {
                const sc: Record<string, string> = { completed: "#22c55e", paid: "#22c55e", signed_up: "#3b82f6", active: "#3b82f6", stalled: "#f59e0b", dropped: "#ef4444", lost: "#f97316" };
                const cc: Record<string, string> = { "App Store": "#a78bfa", "Web App": "#38bdf8" };
                return (
                  <tr key={s.sessionId} onClick={() => setExpanded(expanded === s.sessionId ? null : s.sessionId)} style={{ cursor: "pointer" }}>
                    <td style={{ ...TD, fontFamily: "monospace", fontSize: 11 }}>{s.sessionId}</td>
                    <td style={{ ...TD, whiteSpace: "nowrap", fontSize: 11 }}>{new Date(s.started).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</td>
                    <td style={TD}>{s.source}</td>
                    <td style={{ ...TD, maxWidth: 100 }} title={s.campaign}>{cn(s.campaign)}</td>
                    <td style={TD}>{s.currentStep}</td>
                    <td style={{ ...TD, color: cc[s.click] || "rgba(255,255,255,0.2)", fontSize: 11 }}>{s.click ?? "—"}</td>
                    <td style={{ ...TD, color: sc[s.status] || "#888", fontWeight: 500, textTransform: "capitalize" }}>{s.status}</td>
                    <td style={{ ...TD, fontVariantNumeric: "tabular-nums" }}>{fmt(s.timeInFunnelSec)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
