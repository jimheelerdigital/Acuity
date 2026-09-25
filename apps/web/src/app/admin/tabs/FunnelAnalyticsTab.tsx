"use client";

import { useState, useEffect } from "react";

// The two live v8 funnels. Each tags its events with its own flowVersion, so
// they're tracked as separate cohorts with their own step lists (see
// getFunnelAnalytics in api/admin/metrics/route.ts).
type View = "cmp-ripple" | "cmp-bwk" | "cmp-all" | "ripple" | "bwk" | "test" | "testbwk" | "both" | "legacy";
type CompareMode = "cmp-ripple" | "cmp-bwk" | "cmp-all";
type SplitFilter = "auto" | "on" | "off";
type LegacyFlow = "v7" | "v6" | "v5" | "v4" | "v3" | "v2" | "v1" | "all";
type Traffic = "real" | "inapp" | "all";

const FUNNELS = {
  ripple: { flow: "v8", name: "Ripple", path: "/start" },
  bwk: { flow: "v8-bwk", name: "BWK", path: "/start-bwk" },
  test: { flow: "v9-test", name: "Test", path: "/start-test" },
  testbwk: { flow: "v9-test-bwk", name: "Test BWK", path: "/start-test-bwk" },
} as const;

const LEGACY_LABELS: Record<LegacyFlow, string> = {
  v7: "V7 (paywall split)", v6: "V6 (post-rebuild)", v5: "V5", v4: "V4", v3: "V3", v2: "V2", v1: "V1", all: "All versions",
};

const fetchFunnel = (start: string, end: string, flow: string, traffic: Traffic) =>
  fetch(`/api/admin/metrics?tab=funnel-analytics&start=${start}&end=${end}&flow=${flow}&traffic=${traffic}`)
    .then((r) => { if (!r.ok) throw new Error(`${r.status}`); return r.json(); });

const fetchCompare = (start: string, end: string, traffic: Traffic, split: SplitFilter) =>
  fetch(`/api/admin/metrics?tab=funnel-compare&start=${start}&end=${end}&traffic=${traffic}${split === "auto" ? "" : `&split=${split}`}`)
    .then((r) => { if (!r.ok) throw new Error(`${r.status}`); return r.json(); });

const H: React.CSSProperties = { fontSize: 11, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.1em", color: "rgba(255,255,255,0.3)", marginBottom: 12 };

// One row per step: count bar, % of the previous step, % of the top.
// Outcome rows (the paywall split and download) are indented: they branch
// from an earlier step rather than following the row above.
function FunnelBars({ steps, compact }: { steps: any[]; compact?: boolean }) {
  const maxCount = Math.max(1, ...steps.map((s: any) => s.count));
  const labelW = compact ? 104 : steps.some((s: any) => s.href) ? 190 : 132;
  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 6, fontSize: 9, color: "rgba(255,255,255,0.25)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
        <span style={{ width: labelW }} />
        <span style={{ flex: 1 }}>Sessions</span>
        <span style={{ width: 44, textAlign: "right" }}>vs prev</span>
        <span style={{ width: 40, textAlign: "right" }}>vs top</span>
      </div>
      {steps.map((s: any, i: number) => {
        const pct = Math.max(2, (s.count / maxCount) * 100);
        const color = i === 0 ? "var(--acuity-secondary)" : s.color === "green" ? "var(--acuity-good)" : s.color === "yellow" ? "var(--acuity-warn)" : "var(--acuity-bad)";
        return (
          <div key={s.key} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <span style={{ width: labelW, flexShrink: 0, textAlign: "right", fontSize: 11, color: s.outcome ? "rgba(255,255,255,0.3)" : "rgba(255,255,255,0.5)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={s.label}>
              {s.outcome ? "\u21b3 " : ""}
              {s.href ? (
                <a href={s.href} target="_blank" rel="noreferrer" style={{ color: "inherit", textDecoration: "underline", textDecorationColor: "rgba(255,255,255,0.2)" }}>{s.label}</a>
              ) : s.label}
            </span>
            <div style={{ flex: 1, minWidth: 0, background: "rgba(255,255,255,0.04)", borderRadius: 4, height: compact ? 22 : 26, overflow: "hidden" }}>
              <div style={{ width: `${pct}%`, background: color, opacity: s.outcome ? 0.75 : 1, borderRadius: 4, height: "100%", display: "flex", alignItems: "center", paddingLeft: 8 }}>
                <span style={{ color: "var(--acuity-text)", fontSize: 11, fontWeight: 600 }}>{s.count}</span>
              </div>
            </div>
            <span style={{ width: 44, textAlign: "right", fontSize: 11, color: "rgba(255,255,255,0.45)", fontVariantNumeric: "tabular-nums" }}>{i > 0 ? `${s.stepConversion}%` : ""}</span>
            <span style={{ width: 40, textAlign: "right", fontSize: 10, color: "rgba(255,255,255,0.25)", fontVariantNumeric: "tabular-nums" }}>{i > 0 ? `${s.overallConversion}%` : ""}</span>
          </div>
        );
      })}
    </div>
  );
}

function TrafficNote({ data, traffic }: { data: any; traffic: Traffic }) {
  const t = data?.traffic;
  if (!t) return null;
  return (
    <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", marginTop: 10 }}>
      {traffic === "real"
        ? <>{t.keptSessions} real sessions: every Facebook/Instagram in-app visit, plus anyone in another browser who answered a question. {t.excludedSessions} page-load-only visits hidden (Meta&rsquo;s ad-review crawler poses as iPhone Safari / Windows Chrome and never answers).</>
        : traffic === "inapp"
        ? <>{t.keptSessions} in-app sessions only. {t.excludedSessions} other sessions hidden, including real people who finished in a normal browser.</>
        : <>{t.keptSessions} sessions, all browsers. Includes crawler and link-preview visits.</>}
    </div>
  );
}

// Screen-1 split test (yes/no opener vs 5-option list). Hidden until data exists.
function S1TestCard({ data }: { data: any }) {
  const t = data?.s1Test;
  if (!t || !t.variants?.some((v: any) => v.sessions > 0)) return null;
  const label: Record<string, string> = { yesno: "Yes/No opener", list: "5-option list" };
  const lead = [...t.variants].sort((a: any, b: any) => b.rate - a.rate)[0];
  const minN = Math.min(...t.variants.map((v: any) => v.sessions));
  return (
    <div style={{ marginTop: 16, padding: 14, borderRadius: 10, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
      <div style={H}>Screen 1 split test</div>
      <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ color: "rgba(255,255,255,0.35)", textAlign: "left" }}>
            <th style={{ padding: "4px 0" }}>Variant</th><th>Real visitors</th><th>Answered Q1</th><th>Answer rate</th><th>Accounts</th>
          </tr>
        </thead>
        <tbody>
          {t.variants.map((v: any) => (
            <tr key={v.variant} style={{ color: "var(--acuity-text)" }}>
              <td style={{ padding: "4px 0", fontWeight: 600 }}>{label[v.variant] ?? v.variant}</td>
              <td>{v.sessions}</td><td>{v.answered}</td><td style={{ fontWeight: 700 }}>{v.rate}%</td><td>{v.accounts}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ marginTop: 8, fontSize: 11, color: "rgba(255,255,255,0.45)" }}>
        {t.significant
          ? <>Winner: <b>{label[lead.variant]}</b> (p = {t.pValue.toFixed(3)}, statistically real).</>
          : <>Not decided yet{t.pValue !== null ? ` (p = ${t.pValue.toFixed(2)})` : ""}. {minN < t.targetPerArm ? `Aim for ~${t.targetPerArm} visitors per variant before calling it (now ${minN}).` : "Enough visitors, but no clear difference."}</>}
      </div>
    </div>
  );
}

function SideBySide({ start, end, traffic }: { start: string; end: string; traffic: Traffic }) {
  const [pair, setPair] = useState<{ ripple: any; bwk: any } | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setPair(null); setError(null);
    Promise.all([fetchFunnel(start, end, FUNNELS.ripple.flow, traffic), fetchFunnel(start, end, FUNNELS.bwk.flow, traffic)])
      .then(([ripple, bwk]) => setPair({ ripple, bwk }))
      .catch((e) => setError(e.message));
  }, [start, end, traffic]);
  if (error) return <div style={{ color: "var(--acuity-bad)", padding: 40, textAlign: "center" }}>Error: {error}</div>;
  if (!pair) return <div style={{ color: "var(--acuity-text-ter)", padding: 40, textAlign: "center" }}>Loading both funnels...</div>;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 16 }}>
      {(["ripple", "bwk"] as const).map((k) => {
        const d = pair[k];
        const km = d.keyMetrics || {};
        return (
          <div key={k} style={{ background: "var(--acuity-card-bg)", borderRadius: 12, padding: 20 }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 12 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: "var(--acuity-text)" }}>{FUNNELS[k].name} <span style={{ fontSize: 11, fontWeight: 500, color: "rgba(255,255,255,0.3)" }}>{FUNNELS[k].path}</span></div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)" }}>Biggest drop: {km.biggestDrop?.step ?? "N/A"} ({km.biggestDrop?.dropPct ?? 0}%)</div>
            </div>
            <FunnelBars steps={d.funnelSteps || []} compact />
            <TrafficNote data={d} traffic={traffic} />
          </div>
        );
      })}
    </div>
  );
}


// ── Normal vs test comparison (the /start ↔ /start-test 50/50 split) ─────────
// Each funnel has its own screens, so they're lined up on a shared milestone
// ladder (see getFunnelCompare in api/admin/metrics/route.ts for the exact
// events per funnel). % = share of that funnel's Landed; small % = vs the
// milestone it follows or branches from.

const COMPARE_COLUMNS: Record<CompareMode, (keyof typeof FUNNELS)[]> = {
  "cmp-ripple": ["ripple", "test"],
  "cmp-bwk": ["bwk", "testbwk"],
  "cmp-all": ["ripple", "test", "bwk", "testbwk"],
};
const COLUMN_LABEL: Record<keyof typeof FUNNELS, { title: string; arm: string }> = {
  ripple: { title: "Ripple", arm: "Normal" },
  test: { title: "Ripple", arm: "Test" },
  bwk: { title: "BWK", arm: "Normal" },
  testbwk: { title: "BWK", arm: "Test" },
};

function SplitStatus({ flag }: { flag: { exists: boolean; enabled: boolean; updatedAt: string | null } }) {
  const on = flag.enabled;
  const since = flag.updatedAt ? new Date(flag.updatedAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : null;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "var(--acuity-text-sec)" }}>
      <span style={{ width: 8, height: 8, borderRadius: 999, background: on ? "var(--acuity-good)" : "var(--acuity-text-quiet)" }} />
      {on
        ? <>50/50 split is <b style={{ color: "var(--acuity-text)" }}>on</b>{since ? <> (last changed {since})</> : null}: /start ↔ /start-test and /start-bwk ↔ /start-test-bwk.</>
        : <>50/50 split is <b style={{ color: "var(--acuity-text)" }}>off</b>{flag.exists ? "" : " (feature flag funnel_test_split not created yet)"}. Test-funnel numbers below are direct visits only.</>}
    </div>
  );
}

function PairVerdicts({ tests, target, title }: { tests: any[]; target: number; title?: string }) {
  const n = Math.min(tests[0]?.normal.of ?? 0, tests[0]?.test.of ?? 0);
  const rate = (x: { count: number; of: number }) => (x.of ? `${Math.round((x.count / x.of) * 1000) / 10}%` : "–");
  return (
    <div style={{ marginTop: 12, padding: 12, borderRadius: 10, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
      <div style={{ ...H, marginBottom: 8 }}>{title ?? "Is the difference real?"}</div>
      {tests.map((t) => {
        const lead = t.normal.of && t.test.of ? (t.test.count / t.test.of > t.normal.count / t.normal.of ? "Test" : "Normal") : null;
        return (
          <div key={t.key} style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "baseline", fontSize: 12, padding: "3px 0", color: "var(--acuity-text-sec)" }}>
            <span style={{ minWidth: 140, color: "var(--acuity-text)", fontWeight: 600 }}>{t.label}</span>
            <span style={{ fontVariantNumeric: "tabular-nums" }}>Normal {rate(t.normal)} · Test {rate(t.test)}</span>
            <span style={{ fontSize: 11, color: t.significant && n >= target ? "var(--acuity-good)" : "rgba(255,255,255,0.4)" }}>
              {n < target
                ? `Not enough data yet (${n} of ~${target} visitors per arm)${t.pValue !== null ? `, p = ${t.pValue.toFixed(2)}` : ""}`
                : t.pValue === null
                  ? "No difference to test yet"
                  : t.significant
                    ? `${lead} wins (p = ${t.pValue.toFixed(3)})`
                    : `No clear difference (p = ${t.pValue.toFixed(2)})`}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function NativeSteps({ start, end, traffic, fk }: { start: string; end: string; traffic: Traffic; fk: keyof typeof FUNNELS }) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!open || data) return;
    fetchFunnel(start, end, FUNNELS[fk].flow, traffic).then(setData).catch((e) => setError(e.message));
  }, [open, data, start, end, traffic, fk]);
  const c = COLUMN_LABEL[fk];
  return (
    <div style={{ background: "var(--acuity-card-bg)", borderRadius: 12, padding: "12px 16px" }}>
      <button onClick={() => setOpen((o) => !o)} style={{ background: "none", border: "none", padding: 0, cursor: "pointer", color: "var(--acuity-text-sec)", fontSize: 12, fontWeight: 600 }}>
        {open ? "\u25be" : "\u25b8"} Every screen: {c.title} {c.arm.toLowerCase()} <span style={{ opacity: 0.5, fontWeight: 500 }}>{FUNNELS[fk].path}</span>
      </button>
      {open && (
        <div style={{ marginTop: 12 }}>
          {error ? <div style={{ color: "var(--acuity-bad)", fontSize: 12 }}>Error: {error}</div>
            : !data ? <div style={{ color: "var(--acuity-text-ter)", fontSize: 12 }}>Loading...</div>
            : <FunnelBars steps={data.funnelSteps || []} compact />}
        </div>
      )}
    </div>
  );
}

function CompareView({ start, end, traffic, mode }: { start: string; end: string; traffic: Traffic; mode: CompareMode }) {
  const [split, setSplit] = useState<SplitFilter>("auto");
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setData(null); setError(null);
    fetchCompare(start, end, traffic, split).then(setData).catch((e) => setError(e.message));
  }, [start, end, traffic, split]);
  if (error) return <div style={{ color: "var(--acuity-bad)", padding: 40, textAlign: "center" }}>Error: {error}</div>;
  if (!data) return <div style={{ color: "var(--acuity-text-ter)", padding: 40, textAlign: "center" }}>Loading comparison...</div>;

  const cols = COMPARE_COLUMNS[mode];
  const funnel = (fk: keyof typeof FUNNELS) => data.funnels.find((f: any) => f.flow === FUNNELS[fk].flow);
  const rows = funnel(cols[0]).milestones as any[];
  const twoWay = cols.length === 2;
  const bothLanded = twoWay && cols.every((fk) => funnel(fk).sessions > 0);
  const cellW = twoWay ? 150 : 118;
  const TH: React.CSSProperties = { padding: "8px 10px", fontSize: 11, textAlign: "right", color: "var(--acuity-text-sec)", fontWeight: 600, borderBottom: "1px solid rgba(255,255,255,0.08)", minWidth: cellW };
  const splitOn = data.splitOnly;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
        <SplitStatus flag={data.flag} />
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--acuity-text-sec)", cursor: "pointer" }}
          title="Only sessions that arrived through the 50/50 split (they carry a funnel_split_arm event). Defaults on while the split is on.">
          <input type="checkbox" checked={splitOn} onChange={(e) => setSplit(e.target.checked ? "on" : "off")} />
          Split visitors only
        </label>
      </div>

      <div style={{ background: "var(--acuity-card-bg)", borderRadius: 12, padding: 16, overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr>
              <th style={{ ...TH, textAlign: "left", minWidth: 150 }}>Milestone</th>
              {cols.map((fk) => (
                <th key={fk} style={TH}>
                  <div style={{ color: "var(--acuity-text)", fontSize: 12 }}>{COLUMN_LABEL[fk].title} · {COLUMN_LABEL[fk].arm}</div>
                  <div style={{ fontWeight: 500, opacity: 0.55 }}>{FUNNELS[fk].path}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, ri) => {
              const cells = cols.map((fk) => funnel(fk).milestones[ri]);
              // Better arm per row (2-way only, needs both arms to have visitors).
              const best = bothLanded && ri > 0 && cells[0].pctOfLanded !== cells[1].pctOfLanded
                ? (cells[0].pctOfLanded > cells[1].pctOfLanded ? 0 : 1) : -1;
              return (
                <tr key={row.key}>
                  <td style={{ padding: "8px 10px", borderBottom: "1px solid rgba(255,255,255,0.04)", color: row.branch ? "rgba(255,255,255,0.45)" : "var(--acuity-text-sec)", whiteSpace: "nowrap" }}>
                    {row.branch ? "\u21b3 " : ""}{row.label}
                  </td>
                  {cells.map((c: any, ci: number) => (
                    <td key={ci} style={{
                      padding: "8px 10px", textAlign: "right", borderBottom: "1px solid rgba(255,255,255,0.04)", fontVariantNumeric: "tabular-nums",
                      background: best === ci ? "color-mix(in oklch, var(--acuity-good) 12%, transparent)" : undefined,
                    }}>
                      <span style={{ color: "var(--acuity-text)", fontWeight: 700 }}>{c.count}</span>
                      {ri > 0 && (
                        <>
                          <span style={{ color: best === ci ? "var(--acuity-good)" : "var(--acuity-text-sec)", marginLeft: 6 }}>{c.pctOfLanded}%</span>
                          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)" }} title={`vs ${c.prevLabel}`}>{c.pctOfPrev}% of prev</div>
                        </>
                      )}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", marginTop: 10, lineHeight: 1.5 }}>
          Big % = share of that funnel&rsquo;s visitors who reached the milestone. Small % = vs the step before it (↳ rows branch from the paywall or the gate). The gate is account creation on the normal funnels and the email step on the test funnels.
          {" "}{cols.map((fk) => {
            const f = funnel(fk);
            return `${COLUMN_LABEL[fk].title} ${COLUMN_LABEL[fk].arm.toLowerCase()}: ${f.excludedByTraffic} hidden by the traffic filter${splitOn ? `, ${f.excludedBySplit} direct (non-split) visits hidden` : ""}.`;
          }).join(" ")}
        </div>
      </div>

      {mode !== "cmp-bwk" && <PairVerdicts tests={data.tests.ripple} target={data.targetPerArm} title={mode === "cmp-all" ? "Ripple: normal vs test" : undefined} />}
      {mode !== "cmp-ripple" && <PairVerdicts tests={data.tests.bwk} target={data.targetPerArm} title={mode === "cmp-all" ? "BWK: normal vs test" : undefined} />}
      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)" }}>
        Don&rsquo;t call a winner before ~{data.targetPerArm} real visitors per arm. Card trials need far more than that; use &ldquo;Passed the gate&rdquo; as the early read.
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 12 }}>
        {cols.map((fk) => <NativeSteps key={`${fk}-${traffic}-${start}-${end}`} start={start} end={end} traffic={traffic} fk={fk} />)}
      </div>
    </div>
  );
}

export default function FunnelAnalyticsTab({ start, end }: { start: string; end: string }) {
  const [view, setView] = useState<View>("cmp-ripple");
  const [legacyFlow, setLegacyFlow] = useState<LegacyFlow>("v7");
  const [traffic, setTraffic] = useState<Traffic>("real");

  const seg = (on: boolean): React.CSSProperties => ({
    padding: "6px 12px", fontSize: 12, fontWeight: 600, borderRadius: 6, border: "none", cursor: "pointer",
    background: on ? "var(--acuity-primary)" : "var(--acuity-bg-inset)",
    color: on ? "var(--acuity-text)" : "var(--acuity-text-quiet)",
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center" }}>
        <span style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginRight: 4 }}>Normal vs test:</span>
        <button onClick={() => setView("cmp-ripple")} style={seg(view === "cmp-ripple")}>Ripple</button>
        <button onClick={() => setView("cmp-bwk")} style={seg(view === "cmp-bwk")}>BWK</button>
        <button onClick={() => setView("cmp-all")} style={seg(view === "cmp-all")}>All four</button>
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginRight: 4 }}>One funnel:</span>
          <button onClick={() => setView("ripple")} style={seg(view === "ripple")}>Ripple <span style={{ opacity: 0.6, fontWeight: 500 }}>/start</span></button>
          <button onClick={() => setView("bwk")} style={seg(view === "bwk")}>BWK <span style={{ opacity: 0.6, fontWeight: 500 }}>/start-bwk</span></button>
          <button onClick={() => setView("test")} style={seg(view === "test")}>Test <span style={{ opacity: 0.6, fontWeight: 500 }}>/start-test</span></button>
          <button onClick={() => setView("testbwk")} style={seg(view === "testbwk")}>Test BWK <span style={{ opacity: 0.6, fontWeight: 500 }}>/start-test-bwk</span></button>
          <button onClick={() => setView("both")} style={seg(view === "both")}>Side by side</button>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ display: "flex", gap: 4 }} title="Social in-app = sessions opened inside Instagram, Facebook or TikTok, where ad clicks land. All = includes crawler and link-preview visits.">
            <button onClick={() => setTraffic("real")} style={{ ...seg(traffic === "real"), fontSize: 11, padding: "4px 10px" }}>Real visitors</button>
            <button onClick={() => setTraffic("inapp")} style={{ ...seg(traffic === "inapp"), fontSize: 11, padding: "4px 10px" }}>Social in-app</button>
            <button onClick={() => setTraffic("all")} style={{ ...seg(traffic === "all"), fontSize: 11, padding: "4px 10px" }}>All sessions</button>
          </div>
          <select
            value={view === "legacy" ? legacyFlow : ""}
            onChange={(e) => { if (e.target.value) { setLegacyFlow(e.target.value as LegacyFlow); setView("legacy"); } }}
            style={{ background: "var(--acuity-bg-inset)", color: view === "legacy" ? "var(--acuity-text)" : "var(--acuity-text-quiet)", border: "none", borderRadius: 6, padding: "5px 8px", fontSize: 11 }}
          >
            <option value="">Legacy versions…</option>
            {(Object.keys(LEGACY_LABELS) as LegacyFlow[]).map((v) => <option key={v} value={v}>{LEGACY_LABELS[v]}</option>)}
          </select>
          <span style={{ fontSize: 11, color: "rgba(255,255,255,0.25)" }}>
            {new Date(start).toLocaleDateString("en-US", { month: "short", day: "numeric" })} — {new Date(end).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
          </span>
        </div>
      </div>

      {view === "cmp-ripple" || view === "cmp-bwk" || view === "cmp-all"
        ? <CompareView key={view} start={start} end={end} traffic={traffic} mode={view} />
        : view === "both"
        ? <SideBySide start={start} end={end} traffic={traffic} />
        : <SingleFunnel key={`${view}-${legacyFlow}-${traffic}`} start={start} end={end} traffic={traffic}
            flow={view === "ripple" ? FUNNELS.ripple.flow : view === "bwk" ? FUNNELS.bwk.flow : view === "test" ? FUNNELS.test.flow : view === "testbwk" ? FUNNELS.testbwk.flow : legacyFlow} />}
    </div>
  );
}

function SingleFunnel({ start, end, flow, traffic }: { start: string; end: string; flow: string; traffic: Traffic }) {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [sortCol, setSortCol] = useState("started");
  const [sortDir, setSortDir] = useState(-1);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showPageLoadOnly, setShowPageLoadOnly] = useState(false);
  const isV8 = flow === "v8" || flow === "v8-bwk";

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetchFunnel(start, end, flow, traffic)
      .then((d) => { setData(d); setLoading(false); })
      .catch((e) => { setError(e.message); setLoading(false); });
  }, [start, end, flow, traffic]);

  if (loading) return <div style={{ color: "var(--acuity-text-ter)", padding: 40, textAlign: "center" }}>Loading funnel data...</div>;
  if (error) return (
    <div style={{ color: "var(--acuity-bad)", padding: 40, textAlign: "center" }}>
      Error: {error}
      <button onClick={() => window.location.reload()} style={{ marginLeft: 12, background: "var(--acuity-primary)", color: "var(--acuity-text)", border: "none", borderRadius: 6, padding: "6px 16px", cursor: "pointer" }}>Retry</button>
    </div>
  );
  if (!data) return <div style={{ color: "var(--acuity-text-ter)", padding: 40, textAlign: "center" }}>No data</div>;

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

  // Filter sessions: by default only show sessions that actually STARTED the
  // funnel (enteredFunnel = same real-entry definition as the corrected v5
  // Entry step). The checkbox reveals page-load-only / non-started sessions.
  const filteredSessions = showPageLoadOnly ? sessions : sessions.filter((s: any) => s.enteredFunnel);

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

  const S: React.CSSProperties = { background: "var(--acuity-card-bg)", borderRadius: 12, padding: 20, marginBottom: 20 };
  const TH: React.CSSProperties = { padding: "6px 8px", fontSize: 11, color: "rgba(255,255,255,0.3)", borderBottom: "1px solid rgba(255,255,255,0.08)", cursor: "pointer", userSelect: "none" as const };
  const TD: React.CSSProperties = { padding: "6px 8px", fontSize: 12, color: "var(--acuity-text-ter)", borderBottom: "1px solid rgba(255,255,255,0.04)" };

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

      {/* Account → Paid summary */}
      {(km.totalAccounts ?? 0) > 0 && (
        <div style={{ ...S, display: "flex", alignItems: "center", gap: 16, padding: "14px 20px" }}>
          <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "rgba(255,255,255,0.3)" }}>Total Accounts:</span>
          <span style={{ fontSize: 20, fontWeight: 700, color: "var(--acuity-text)" }}>{km.totalAccounts}</span>
          <span style={{ fontSize: 16, color: "rgba(255,255,255,0.2)" }}>→</span>
          <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "rgba(255,255,255,0.3)" }}>Paid (Stripe, all versions):</span>
          <span style={{ fontSize: 20, fontWeight: 700, color: "var(--acuity-good)" }}>{km.totalPaid}</span>
          <span style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", fontWeight: 600 }}>
            ({km.paidConversion ?? 0}% of new accounts have paid)
          </span>
          <span style={{ flex: 1 }} />
          <span style={{ fontSize: 11, color: "rgba(255,255,255,0.25)" }}>
            {km.totalTrialContinued ?? 0} continued on trial
          </span>
        </div>
      )}

      {/* Page Load → First Tap funnel.
          First Tap = funnel_entry_selected (the user tapped a Q1 answer = the
          real first interaction), NOT the old "interacted" count, which fired on
          any non-view event and so nearly equalled page loads (the impossible
          99%). Page Loads here is the entry_viewed view count, so this banner is
          a bold summary of the raw-events strip below and agrees with it
          exactly: First Tap === entry_selected, and the % === the real tap rate
          (entry_selected / entry_viewed). It also matches the funnel's Entry
          step, which now counts entry_selected too. */}
      {!isV8 && (diag.entryViewedEvents ?? 0) > 0 && (
        <div style={{ ...S, display: "flex", alignItems: "center", gap: 16, padding: "14px 20px" }}>
          <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "rgba(255,255,255,0.3)" }}>Page Loads:</span>
          <span style={{ fontSize: 20, fontWeight: 700, color: "var(--acuity-text)" }}>{diag.entryViewedEvents}</span>
          <span style={{ fontSize: 16, color: "rgba(255,255,255,0.2)" }}>→</span>
          <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "rgba(255,255,255,0.3)" }}>First Tap:</span>
          <span style={{ fontSize: 20, fontWeight: 700, color: "var(--acuity-good)" }}>{diag.entrySelectedEvents}</span>
          <span style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", fontWeight: 600 }}>
            ({diag.tapRate ?? 0}%)
          </span>
          <span style={{ flex: 1 }} />
          <span style={{ fontSize: 10, color: "rgba(255,255,255,0.2)" }}>
            {(diag.entryViewedEvents ?? 0) - (diag.entrySelectedEvents ?? 0)} viewed, didn’t tap Q1
          </span>
        </div>
      )}

      {/* Raw event diagnostics */}
      {!isV8 && diag.entryViewedEvents > 0 && (
        <div style={{ ...S, padding: "10px 20px", display: "flex", gap: 20, alignItems: "center", fontSize: 11, color: "rgba(255,255,255,0.3)" }}>
          <span>Raw events: <strong style={{ color: "rgba(255,255,255,0.6)" }}>{diag.totalEventsInRange}</strong></span>
          <span>entry_viewed: <strong style={{ color: "rgba(255,255,255,0.6)" }}>{diag.entryViewedEvents}</strong></span>
          <span>entry_selected: <strong style={{ color: "rgba(255,255,255,0.6)" }}>{diag.entrySelectedEvents}</strong></span>
          <span>Tap rate: <strong style={{ color: diag.tapRate >= 50 ? "var(--acuity-good)" : diag.tapRate >= 20 ? "var(--acuity-warn)" : "var(--acuity-bad)" }}>{diag.tapRate}%</strong></span>
        </div>
      )}

      {/* Key Metrics */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12 }}>
        {[
          { label: "Sessions", value: km.totalSessions ?? 0, sub: `${km.todaySessions ?? 0} today` },
          { label: "Completion", value: `${km.completionRate ?? 0}%`, sub: isV8 ? "landed \u2192 card trial" : undefined },
          { label: "Biggest Drop", value: km.biggestDrop?.step ?? "N/A", sub: `${km.biggestDrop?.dropPct ?? 0}% lost` },
          { label: "Avg Time", value: fmt(km.avgFunnelTimeSec ?? 0) },
        ].map((m, i) => (
          <div key={i} style={S}>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "0.1em" }}>{m.label}</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: "var(--acuity-text)", marginTop: 4 }}>{m.value}</div>
            {m.sub && <div style={{ fontSize: 11, color: "rgba(255,255,255,0.25)", marginTop: 2 }}>{m.sub}</div>}
          </div>
        ))}
      </div>

      {/* Conversion Rates */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12 }}>
        {[
          { label: "Account Creation", value: `${km.accountCreationRate ?? 0}%`, sub: isV8 ? "account screen → account" : "timeline → account" },
          { label: isV8 ? "Card Trial" : "Immediate Pay", value: `${km.immediatePayRate ?? 0}%`, sub: isV8 ? "account → card trial" : "account → paid" },
          { label: isV8 ? "Free Plan" : "Trial Skip", value: `${km.trialSkipRate ?? 0}%`, sub: isV8 ? "account → free plan" : "account → trial" },
          { label: "Download", value: `${km.downloadRate ?? 0}%`, sub: "account → download" },
        ].map((m, i) => (
          <div key={i} style={S}>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "0.1em" }}>{m.label}</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: "var(--acuity-text)", marginTop: 4 }}>{m.value}</div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.25)", marginTop: 2 }}>{m.sub}</div>
          </div>
        ))}
      </div>

      {/* Commit Completion % (7c) */}
      {(diag.commitViewedSessions ?? 0) > 0 && (
        <div style={{ ...S, display: "flex", alignItems: "center", gap: 16, padding: "14px 20px" }}>
          <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "rgba(255,255,255,0.3)" }}>Commit Screen:</span>
          <span style={{ fontSize: 20, fontWeight: 700, color: "var(--acuity-text)" }}>{diag.commitViewedSessions}</span>
          <span style={{ fontSize: 16, color: "rgba(255,255,255,0.2)" }}>→</span>
          <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "rgba(255,255,255,0.3)" }}>Held to Commit:</span>
          <span style={{ fontSize: 20, fontWeight: 700, color: "var(--acuity-good)" }}>{diag.commitCompletedSessions}</span>
          <span style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", fontWeight: 600 }}>
            ({diag.commitCompletionRate ?? 0}% completion)
          </span>
        </div>
      )}

      {/* Ad-match breakdown (7d) */}
      {(data.adMatchStats?.total ?? 0) > 0 && (
        <div style={{ ...S, padding: "14px 20px" }}>
          <div style={{ ...H, marginBottom: 8 }}>Banner-to-Buyer Attribution</div>
          <div style={{ display: "flex", gap: 20, fontSize: 12, color: "var(--acuity-text-ter)" }}>
            <span>Sessions with ad-match: <strong style={{ color: "var(--acuity-text)" }}>{data.adMatchStats.total}</strong></span>
            <span>Selected highlighted: <strong style={{ color: "var(--acuity-good)" }}>{data.adMatchStats.matched}</strong> ({data.adMatchStats.total > 0 ? Math.round((data.adMatchStats.matched / data.adMatchStats.total) * 100) : 0}%)</span>
            <span>Selected different: <strong style={{ color: "var(--acuity-warn)" }}>{data.adMatchStats.different}</strong></span>
            <span>Without param: <strong style={{ color: "rgba(255,255,255,0.4)" }}>{data.adMatchStats.withoutParam}</strong></span>
          </div>
        </div>
      )}

      {/* Conversion Funnel */}
      <div style={S}>
        <div style={H}>Conversion Funnel{isV8 ? ` \u2014 ${flow === "v8" ? "Ripple /start" : "BWK /start-bwk"}` : ""}</div>
        <FunnelBars steps={steps} />
        <TrafficNote data={data} traffic={traffic} />
        <S1TestCard data={data} />

        {/* Paid (Stripe-verified) — below funnel bars */}
        {(data.stripePaid ?? []).length > 0 && (
          <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 8, padding: "10px 0", borderTop: "1px solid var(--acuity-bg-inset)" }}>
            <span style={{ width: 80, textAlign: "right", fontSize: 11, color: "var(--acuity-good)", fontWeight: 700 }} title="New Stripe subscribers in the date range who came through this funnel">Paid (Stripe)</span>
            <div style={{ flex: 1, background: "rgba(255,255,255,0.04)", borderRadius: 4, height: 26, position: "relative", overflow: "hidden" }}>
              <div style={{ width: `${Math.max(2, ((data.stripePaid?.length ?? 0) / (steps[0]?.count || 1)) * 100)}%`, background: "var(--acuity-good)", borderRadius: 4, height: "100%", display: "flex", alignItems: "center", paddingLeft: 8 }}>
                <span style={{ color: "var(--acuity-text)", fontSize: 11, fontWeight: 600 }}>{data.stripePaid?.length ?? 0}</span>
              </div>
            </div>
            <span style={{ width: 80, textAlign: "right", fontSize: 11, color: "rgba(255,255,255,0.3)" }}>
              {steps[0]?.count > 0 ? `${Math.round(((data.stripePaid?.length ?? 0) / steps[0].count) * 100)}%` : ""}
            </span>
          </div>
        )}
        {(data.stripePaid ?? []).length === 0 && (
          <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 8, padding: "10px 0", borderTop: "1px solid var(--acuity-bg-inset)" }}>
            <span style={{ width: 80, textAlign: "right", fontSize: 11, color: "rgba(255,255,255,0.3)", fontWeight: 700 }}>Paid (Stripe)</span>
            <span style={{ fontSize: 11, color: "rgba(255,255,255,0.25)" }}>0 — no Stripe subscriptions in this period</span>
          </div>
        )}
      </div>

      {/* Signup Failure Breakdown */}
      {(data.signupFailures?.total > 0) && (
        <div style={S}>
          <div style={H}>Signup Failures</div>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 8 }}>
            <div style={{ fontSize: 11, color: "var(--acuity-text-ter)" }}>
              <span style={{ color: "var(--acuity-bad)", fontWeight: 700, fontSize: 14 }}>{data.signupFailures.total}</span> failed attempt{data.signupFailures.total !== 1 ? "s" : ""}
              {data.signupFailures.topReason && (
                <span> — top reason: <span style={{ color: "var(--acuity-warn)", fontWeight: 600 }}>{data.signupFailures.topReason}</span></span>
              )}
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {Object.entries(data.signupFailures.reasons as Record<string, number>)
              .sort(([, a], [, b]) => (b as number) - (a as number))
              .map(([reason, count]) => (
                <div key={reason} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11 }}>
                  <span style={{ color: "var(--acuity-text-quiet)", width: 28, textAlign: "right", fontWeight: 600 }}>{count as number}</span>
                  <span style={{ color: "var(--acuity-text-ter)" }}>{reason}</span>
                </div>
              ))}
          </div>
          {data.signupFailures.started && Object.keys(data.signupFailures.started).length > 0 && (
            <div style={{ marginTop: 8, borderTop: "1px solid var(--acuity-bg-inset)", paddingTop: 8 }}>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", marginBottom: 4 }}>Attempts by method</div>
              {Object.entries(data.signupFailures.started as Record<string, number>).map(([method, count]) => (
                <span key={method} style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginRight: 12 }}>
                  {method}: <span style={{ fontWeight: 600 }}>{count as number}</span>
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Ready for Change (Gap 3 yes/no) */}
      {(data.readyForChange?.total > 0) && (
        <div style={S}>
          <div style={H}>Ready for Change (Gap 3)</div>
          <div style={{ display: "flex", gap: 16, alignItems: "baseline" }}>
            <span style={{ fontSize: 22, fontWeight: 700, color: "var(--acuity-good)" }}>{data.readyForChange.yesPct}% yes</span>
            <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>
              {data.readyForChange.yes} yes / {data.readyForChange.no} no ({data.readyForChange.total} total)
            </span>
          </div>
        </div>
      )}

      {/* Gap 2 Feelings Distribution */}
      {data.feelingsDistribution && Object.keys(data.feelingsDistribution).length > 0 && (
        <div style={S}>
          <div style={H}>Gap 2 Feelings (future ad angles)</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {Object.entries(data.feelingsDistribution as Record<string, number>)
              .sort(([, a], [, b]) => (b as number) - (a as number))
              .map(([feeling, count]) => (
                <div key={feeling} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11 }}>
                  <span style={{ color: "var(--acuity-text-quiet)", width: 28, textAlign: "right", fontWeight: 600 }}>{count as number}</span>
                  <span style={{ color: "var(--acuity-text-ter)" }}>{feeling}</span>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Tally Distribution */}
      {data.tallyDistribution && Object.keys(data.tallyDistribution).length > 0 && (
        <div style={S}>
          <div style={H}>Tally Distribution (ad hooks)</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {Object.entries(data.tallyDistribution as Record<string, number>)
              .sort(([a], [b]) => {
                if (a === "lost_count") return 1;
                if (b === "lost_count") return -1;
                return parseInt(b) - parseInt(a);
              })
              .map(([value, count]) => (
                <div key={value} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11 }}>
                  <span style={{ color: "var(--acuity-text-quiet)", width: 28, textAlign: "right", fontWeight: 600 }}>{count as number}</span>
                  <span style={{ color: value === "lost_count" ? "var(--acuity-warn)" : "var(--acuity-text-ter)", fontWeight: value === "lost_count" ? 600 : 400 }}>
                    {value === "lost_count" ? "lost count" : `${value}x per week`}
                  </span>
                </div>
              ))}
          </div>
        </div>
      )}

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
                  <td style={{ ...TD, textAlign: "right", color: "var(--acuity-bad)", fontWeight: 600 }}>{d.count}</td>
                  <td style={{ ...TD, textTransform: "capitalize" }}>{d.topBranch}</td>
                  <td style={{ ...TD, textAlign: "right" }}>{fmt(d.avgTimeSec)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Branch Breakdown — v8 path per entry answer */}
      {data.branchSteps && data.branchSteps.rows.length > 0 && (
        <div style={{ ...S, overflowX: "auto" }}>
          <div style={H}>By Q1 answer</div>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr>
              <th style={{ ...TH, textAlign: "left" }}>Branch</th>
              {data.branchSteps.columns.map((c: any) => <th key={c.key} style={{ ...TH, textAlign: "right" }}>{c.label}</th>)}
            </tr></thead>
            <tbody>
              {data.branchSteps.rows.map((r: any) => (
                <tr key={r.branch}>
                  <td style={{ ...TD, textTransform: "capitalize", fontWeight: 500 }}>{r.branch}</td>
                  {data.branchSteps.columns.map((c: any) => <td key={c.key} style={{ ...TD, textAlign: "right" }}>{r.counts[c.key] ?? 0}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Branch Breakdown (legacy Q4/Mirror/Commit steps) */}
      {!data.branchSteps && branches.length > 0 && (
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
                    <td style={{ ...TD, textAlign: "right", fontWeight: 600, color: b.overallRate >= 5 ? "var(--acuity-good)" : b.overallRate > 0 ? "var(--acuity-warn)" : "var(--acuity-bad)" }}>{b.overallRate}%</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Campaign Funnels */}
      <div style={{ ...S, overflowX: "auto" }}>
        <div style={H}>Campaign Funnels</div>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr>
            {(isV8 ? ["Campaign", "Landed", "Q1", "Result", "Acct screen", "Account", "Card trial", "Rate"] : ["Campaign", "Sessions", "Q2", "Mirror", "Commit", "Account", "Paid", "Rate"]).map((h) => (
              <th key={h} style={{ ...TH, textAlign: h === "Campaign" ? "left" : "right" }}>{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {campaigns.map((cf: any) => (
              <tr key={cf.campaign}>
                <td style={{ ...TD, maxWidth: 160 }} title={cf.campaign}>{cn(cf.campaign)}</td>
                {isV8 ? (<>
                  <td style={{ ...TD, textAlign: "right" }}>{cf.steps?.landed ?? 0}</td>
                  <td style={{ ...TD, textAlign: "right" }}>{cf.steps?.entry ?? 0}</td>
                  <td style={{ ...TD, textAlign: "right" }}>{cf.steps?.pattern_result ?? 0}</td>
                  <td style={{ ...TD, textAlign: "right" }}>{cf.steps?.create_account ?? 0}</td>
                </>) : (<>
                  <td style={{ ...TD, textAlign: "right" }}>{cf.sessions}</td>
                  <td style={{ ...TD, textAlign: "right" }}>{cf.steps?.branch_q2 ?? 0}</td>
                  <td style={{ ...TD, textAlign: "right" }}>{cf.steps?.mirror ?? 0}</td>
                  <td style={{ ...TD, textAlign: "right" }}>{cf.steps?.commit ?? 0}</td>
                </>)}
                <td style={{ ...TD, textAlign: "right" }}>{cf.steps?.account ?? 0}</td>
                <td style={{ ...TD, textAlign: "right" }}>{cf.steps?.paid ?? 0}</td>
                <td style={{ ...TD, textAlign: "right", fontWeight: 600, color: cf.conversionRate >= 5 ? "var(--acuity-good)" : cf.conversionRate > 0 ? "var(--acuity-warn)" : "var(--acuity-bad)" }}>{cf.conversionRate}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Sessions */}
      <div style={S}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
          <div style={H as any}>Sessions ({filteredSessions.length})</div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 11, color: "rgba(255,255,255,0.3)" }}>
              <input
                type="checkbox"
                checked={showPageLoadOnly}
                onChange={(e) => setShowPageLoadOnly(e.target.checked)}
                style={{ accentColor: "var(--acuity-primary)" }}
              />
              {isV8 ? "Show sessions that never answered Q1" : "Show page-load-only sessions"}
            </label>
            <button onClick={downloadCsv} style={{ background: "var(--acuity-bg-inset)", border: "none", borderRadius: 6, padding: "4px 12px", fontSize: 11, color: "rgba(255,255,255,0.4)", cursor: "pointer" }}>
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
                const sc: Record<string, string> = { completed: "var(--acuity-good)", paid: "var(--acuity-good)", signed_up: "var(--acuity-secondary)", active: "var(--acuity-secondary)", stalled: "var(--acuity-warn)", dropped: "var(--acuity-bad)", lost: "var(--acuity-warn)" };
                const cc: Record<string, string> = { "App Store": "var(--acuity-primary-hi)", "Web App": "var(--acuity-secondary)" };
                return (
                  <tr key={s.sessionId} onClick={() => setExpanded(expanded === s.sessionId ? null : s.sessionId)} style={{ cursor: "pointer" }}>
                    <td style={{ ...TD, fontFamily: "monospace", fontSize: 11 }}>{s.sessionId}</td>
                    <td style={{ ...TD, whiteSpace: "nowrap", fontSize: 11 }}>{new Date(s.started).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</td>
                    <td style={TD}>{s.source}</td>
                    <td style={{ ...TD, maxWidth: 100 }} title={s.campaign}>{cn(s.campaign)}</td>
                    <td style={TD}>{s.currentStep}</td>
                    <td style={{ ...TD, color: cc[s.click] || "rgba(255,255,255,0.2)", fontSize: 11 }}>{s.click ?? "—"}</td>
                    <td style={{ ...TD, color: sc[s.status] || "var(--acuity-text-ter)", fontWeight: 500, textTransform: "capitalize" }}>{s.status}</td>
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
