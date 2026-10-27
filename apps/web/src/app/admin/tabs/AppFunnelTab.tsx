"use client";

// In-app onboarding funnel (2026-10-20, per Keenan: "track every stage of our
// funnel in app to see if people are dropping off at any stage"). Data:
// getAppFunnel in lib/admin/app-funnel.ts.

import { useTabData } from "./useTabData";

type Step = { key: string; label: string; views: number; people: number; pctOfTop: number; pctOfPrev: number; branch?: boolean; group: "questions" | "core" };
type Data = {
  steps: Step[];
  problems: { label: string; people: number }[];
  preSignIn: { label: string; views: number }[];
  welcome: { label: string; people: number }[];
  biggestDrop: { from: string; to: string; lost: number; pct: number } | null;
  totals: { events: number; unlinkedEvents: number };
};

const H: React.CSSProperties = { fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "rgba(255,255,255,0.3)", marginBottom: 12 };
const card: React.CSSProperties = { background: "var(--acuity-card-bg)", borderRadius: 12, padding: 20 };

function Bars({ steps }: { steps: Step[] }) {
  const top = Math.max(1, steps[0]?.views ?? 1);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {steps.map((s) => {
        const weak = !s.branch && s.pctOfPrev < 70;
        return (
          <div key={s.key} style={{ paddingLeft: s.branch ? 24 : 0 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "var(--acuity-text)", marginBottom: 4 }}>
              <span>{s.branch ? "↳ " : ""}{s.label}</span>
              <span style={{ color: "var(--acuity-text-sec)" }}>
                <b style={{ color: "var(--acuity-text)" }}>{s.views}</b>
                {" · "}{s.pctOfTop}%
                <span style={{ color: weak ? "var(--acuity-bad)" : "rgba(255,255,255,0.35)", marginLeft: 6 }}>
                  ({s.pctOfPrev}% {s.branch ? "of paywall" : "of prev"})
                </span>
              </span>
            </div>
            <div style={{ height: 8, borderRadius: 4, background: "var(--acuity-bg-inset)" }}>
              <div style={{ height: 8, borderRadius: 4, width: `${Math.max(1, (s.views / top) * 100)}%`, background: s.branch ? "#8f7cf5" : weak ? "var(--acuity-bad)" : "var(--acuity-primary)" }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function AppFunnelTab({ start, end }: { start: string; end: string }) {
  const { data, loading, error } = useTabData<Data>("app-funnel", start, end);
  if (error) return <div style={{ color: "var(--acuity-bad)", padding: 40, textAlign: "center" }}>Error: {error}</div>;
  if (loading || !data) return <div style={{ color: "var(--acuity-text-ter)", padding: 40, textAlign: "center" }}>Loading app funnel...</div>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ ...card, padding: 14, fontSize: 12, color: "var(--acuity-text-sec)", lineHeight: 1.5 }}>
        New app installs, from the first onboarding question to the paywall. Older app versions skip the questions, so they&rsquo;re a separate section; both paths meet at &ldquo;Tapped start recording&rdquo;. Counts are times each step happened (retries count again; app 1.9.5+ tags each install, but Android and older builds don&rsquo;t). The paywall and its outcomes are people. Red = more than 30% lost since the step before.
        {data.biggestDrop && (
          <> Biggest drop: <b style={{ color: "var(--acuity-text)" }}>{data.biggestDrop.from} → {data.biggestDrop.to}</b> ({data.biggestDrop.lost} fewer, {data.biggestDrop.pct}%).</>
        )}
      </div>

      <div style={card}>
        <div style={H}>Questions (app 1.9.x only)</div>
        {data.steps.some((s) => s.group === "questions" && s.views) ? <Bars steps={data.steps.filter((s) => s.group === "questions")} /> : <div style={{ color: "var(--acuity-text-ter)", fontSize: 13 }}>No question screens in this range.</div>}
      </div>

      <div style={card}>
        <div style={H}>Recording to paywall (every app version)</div>
        {data.steps.some((s) => s.group === "core" && s.views) ? <Bars steps={data.steps.filter((s) => s.group === "core")} /> : <div style={{ color: "var(--acuity-text-ter)", fontSize: 13 }}>No onboarding recordings in this range.</div>}
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", marginTop: 12, lineHeight: 1.5 }}>
          The paywall has no skip: everyone who saw it either started an App Store / Play trial (read from their account) or left.
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16 }}>
        <div style={card}>
          <div style={H}>Problems along the way</div>
          {data.problems.map((p) => (
            <div key={p.label} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "var(--acuity-text)", padding: "4px 0" }}>
              <span>{p.label}</span>
              <b style={{ color: p.people ? "var(--acuity-bad)" : "var(--acuity-text-sec)" }}>{p.people}</b>
            </div>
          ))}
        </div>

        <div style={card}>
          <div style={H}>Before sign-in (screen views)</div>
          {data.preSignIn.map((p) => (
            <div key={p.label} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "var(--acuity-text)", padding: "4px 0" }}>
              <span>{p.label}</span>
              <b>{p.views}</b>
            </div>
          ))}
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", marginTop: 8, lineHeight: 1.5 }}>
            Views, not people: {data.totals.unlinkedEvents} of {data.totals.events} events in range carry no install id (Android 1.9.0 and older builds).
          </div>
        </div>

        <div style={card}>
          <div style={H}>Web payers: welcome flow</div>
          {data.welcome.map((p) => (
            <div key={p.label} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "var(--acuity-text)", padding: "4px 0" }}>
              <span>{p.label}</span>
              <b>{p.people}</b>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
