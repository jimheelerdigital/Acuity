/**
 * Marketing Life Matrix phone-mockup — ported from the handoff
 * (`screen-lifematrix.jsx`) and adapted to the LIVE app
 * (parity-by-default):
 *   - 10 axes from the canonical DEFAULT_LIFE_AREAS (the prototype had 12,
 *     incl. Creativity/Body/Mind/Joy that never shipped). Axis labels +
 *     colors come from @acuity/shared so they can't drift.
 *   - NO "Theme Map | Matrix | Trends" segmented tabs (live = routed).
 * Static, token-object driven, fixed mode. See PRODUCT_DRIFT_AUDIT.md.
 */
import { DEFAULT_LIFE_AREAS } from "@acuity/shared";
import type { AcuityTokens } from "@acuity/shared";

import { AcuityDevice, AcuityIcons, AcuityStatus, AcuityTabBar, RingProgress, SectionHead, pillBtn } from "./chrome";

// TODO(copy): placeholder demo scores — not real user data. Ordered to
// match DEFAULT_LIFE_AREAS (Career, Money, Romance, Family, Friends,
// Physical Health, Mental Health, Growth, Fun, Purpose).
const DEMO: { score: number; prev: number; trend: number[] }[] = [
  { score: 78, prev: 71, trend: [65, 68, 70, 71, 73, 75, 78] },
  { score: 66, prev: 62, trend: [60, 60, 61, 62, 63, 64, 66] },
  { score: 48, prev: 50, trend: [55, 53, 51, 50, 49, 49, 48] },
  { score: 82, prev: 80, trend: [78, 79, 80, 80, 81, 82, 82] },
  { score: 61, prev: 55, trend: [50, 52, 53, 55, 58, 60, 61] },
  { score: 54, prev: 58, trend: [62, 60, 60, 58, 56, 55, 54] },
  { score: 70, prev: 68, trend: [65, 66, 67, 68, 69, 69, 70] },
  { score: 73, prev: 65, trend: [62, 63, 65, 65, 68, 70, 73] },
  { score: 64, prev: 60, trend: [58, 59, 59, 60, 61, 62, 64] },
  { score: 76, prev: 70, trend: [68, 68, 69, 70, 72, 74, 76] },
];

const MATRIX_AREAS = DEFAULT_LIFE_AREAS.map((a, i) => ({
  name: a.shortName,
  color: a.color,
  score: DEMO[i].score,
  prev: DEMO[i].prev,
  trend: DEMO[i].trend,
}));

function pt(cx: number, cy: number, r: number, angleDeg: number): [number, number] {
  const a = ((angleDeg - 90) * Math.PI) / 180;
  return [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
}

export function LifeMatrix({ t }: { t: AcuityTokens }) {
  const CX = 201, CY = 200, R = 130;
  const N = MATRIX_AREAS.length;
  const step = 360 / N;

  const curPts = MATRIX_AREAS.map((a, i) => pt(CX, CY, (a.score / 100) * R, i * step));
  const prevPts = MATRIX_AREAS.map((a, i) => pt(CX, CY, (a.prev / 100) * R, i * step));

  const overall = Math.round(MATRIX_AREAS.reduce((s, a) => s + a.score, 0) / N);
  const overallPrev = Math.round(MATRIX_AREAS.reduce((s, a) => s + a.prev, 0) / N);
  const delta = overall - overallPrev;

  const movers = MATRIX_AREAS
    .map((a) => ({ ...a, d: a.score - a.prev }))
    .sort((a, b) => Math.abs(b.d) - Math.abs(a.d))
    .slice(0, 4);

  return (
    <AcuityDevice t={t}>
      <AcuityStatus dark={t.mode === "dark"} />

      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 540, background: t.heroGrad, pointerEvents: "none" }} />

      <div className="acuity-scroll" style={{ position: "absolute", inset: 0, paddingTop: 56, paddingBottom: 130, overflowY: "auto" }}>
        {/* Top bar */}
        <div style={{ padding: "14px 16px 0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <button style={pillBtn(t)}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke={t.textSec} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9.5 2L4 7l5.5 5" />
            </svg>
          </button>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontFamily: t.mono, fontSize: 10, letterSpacing: 1.6, textTransform: "uppercase", color: t.textTer }}>Insights</div>
            <div style={{ fontFamily: t.display, fontSize: 15, fontWeight: 700, color: t.text, letterSpacing: -0.2, marginTop: 2 }}>Life Matrix</div>
          </div>
          <button style={pillBtn(t)}>{AcuityIcons.more({ color: t.textSec })}</button>
        </div>

        {/* Big score block — ring + delta */}
        <div style={{ padding: "20px 20px 0", display: "flex", alignItems: "center", gap: 18 }}>
          <RingProgress value={overall / 100} size={108} stroke={9} t={t}>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontFamily: t.display, fontSize: 36, fontWeight: 800, color: t.text, letterSpacing: -1.5, lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>{overall}</div>
              <div style={{ fontFamily: t.mono, fontSize: 9, letterSpacing: 1.2, color: t.textTer, textTransform: "uppercase", marginTop: 2 }}>/ 100</div>
            </div>
          </RingProgress>
          <div style={{ flex: 1, minWidth: 0 }}>
            {/* TODO(copy): placeholder week label + headline. */}
            <div style={{ fontFamily: t.mono, fontSize: 10, letterSpacing: 1.4, textTransform: "uppercase", color: t.textTer }}>Week of Oct 9 — 15</div>
            <div style={{ fontFamily: t.display, fontSize: 18, fontWeight: 700, color: t.text, letterSpacing: -0.4, lineHeight: 1.2, marginTop: 4, textWrap: "pretty" }}>You&rsquo;re trending up across most areas.</div>
            <div style={{
              display: "inline-flex", alignItems: "center", gap: 4, marginTop: 8, padding: "3px 10px", borderRadius: 999,
              background: delta >= 0 ? t.goodSoft : t.badSoft, fontFamily: t.mono, fontSize: 11, fontWeight: 700, color: delta >= 0 ? t.good : t.bad,
            }}>
              <span style={{ fontSize: 11 }}>{delta >= 0 ? "↗" : "↘"}</span>
              {delta >= 0 ? "+" : ""}{delta} vs last week
            </div>
          </div>
        </div>

        {/* Radar */}
        <div style={{ position: "relative", height: 380, marginTop: 8 }}>
          <svg viewBox="0 0 402 400" style={{ width: "100%", height: "100%", overflow: "visible" }}>
            <defs>
              <radialGradient id="lm-fill" cx="50%" cy="50%" r="50%" fx="40%" fy="35%">
                <stop offset="0%" stopColor={t.primary} stopOpacity="0.85" />
                <stop offset="60%" stopColor={t.secondary} stopOpacity="0.55" />
                <stop offset="100%" stopColor={t.secondary} stopOpacity="0.1" />
              </radialGradient>
              <linearGradient id="lm-stroke" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor={t.primary} />
                <stop offset="100%" stopColor={t.secondary} />
              </linearGradient>
              <filter id="lm-glow">
                <feGaussianBlur stdDeviation="4" />
              </filter>
            </defs>

            {[0.2, 0.4, 0.6, 0.8, 1].map((p, i) => {
              const pts = MATRIX_AREAS.map((_, j) => pt(CX, CY, R * p, j * step));
              return <polygon key={i} points={pts.map(([x, y]) => `${x},${y}`).join(" ")} fill="none" stroke={t.mode === "dark" ? "oklch(1 0 0 / 0.05)" : "oklch(0 0 0 / 0.06)"} strokeWidth={i === 4 ? 0.8 : 0.5} />;
            })}

            {MATRIX_AREAS.map((_, i) => {
              const [x, y] = pt(CX, CY, R, i * step);
              return <line key={`ax${i}`} x1={CX} y1={CY} x2={x} y2={y} stroke={t.mode === "dark" ? "oklch(1 0 0 / 0.04)" : "oklch(0 0 0 / 0.05)"} strokeWidth={0.5} />;
            })}

            <polygon points={prevPts.map(([x, y]) => `${x},${y}`).join(" ")} fill="none" stroke={t.mode === "dark" ? "oklch(1 0 0 / 0.18)" : "oklch(0 0 0 / 0.22)"} strokeWidth={1.2} strokeDasharray="3 3" />
            <polygon points={curPts.map(([x, y]) => `${x},${y}`).join(" ")} fill="url(#lm-fill)" opacity={0.55} filter="url(#lm-glow)" />
            <polygon points={curPts.map(([x, y]) => `${x},${y}`).join(" ")} fill="url(#lm-fill)" stroke="url(#lm-stroke)" strokeWidth={1.8} strokeLinejoin="round" />

            {curPts.map(([x, y], i) => {
              const dd = MATRIX_AREAS[i].score - MATRIX_AREAS[i].prev;
              const c = dd > 0 ? t.good : dd < 0 ? t.bad : t.primary;
              return <circle key={`d${i}`} cx={x} cy={y} r={3.4} fill={c} stroke={t.bg} strokeWidth={1.5} />;
            })}

            {MATRIX_AREAS.map((a, i) => {
              const [lx, ly] = pt(CX, CY, R + 26, i * step);
              return (
                <g key={`lbl${i}`}>
                  <text x={lx} y={ly - 4} textAnchor="middle" dominantBaseline="middle" style={{ fontFamily: t.sans, fontSize: 11, fontWeight: 700, fill: t.text, letterSpacing: -0.1 }}>{a.name}</text>
                  <text x={lx} y={ly + 10} textAnchor="middle" dominantBaseline="middle" style={{ fontFamily: t.mono, fontSize: 10, letterSpacing: 0.4, fill: t.textTer, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{a.score}</text>
                </g>
              );
            })}

            <circle cx={CX} cy={CY} r={2.5} fill={t.textTer} />
          </svg>
        </div>

        {/* Legend */}
        <div style={{ display: "flex", justifyContent: "center", gap: 18, padding: "6px 0 0", fontFamily: t.mono, fontSize: 10, letterSpacing: 0.6, textTransform: "uppercase", color: t.textTer, fontWeight: 600 }}>
          <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 14, height: 3, background: t.gradMix, borderRadius: 2 }} />This week
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 14, height: 0, borderTop: `1.5px dashed ${t.textTer}`, opacity: 0.7 }} />Last week
          </span>
        </div>

        {/* Top movers */}
        <div style={{ padding: "24px 20px 0" }}>
          <SectionHead t={t} label="Biggest moves" count={4} />
        </div>
        <div style={{ padding: "0 16px", display: "flex", flexDirection: "column", gap: 10 }}>
          {movers.map((m) => {
            const up = m.d > 0;
            return (
              <div key={m.name} style={{ padding: "14px 14px", borderRadius: 20, background: t.cardBg, border: `0.5px solid ${t.line}`, boxShadow: t.shadowSoft, display: "flex", alignItems: "center", gap: 14 }}>
                <div style={{ width: 36, height: 36, borderRadius: 18, flexShrink: 0, background: `color-mix(in oklch, ${m.color}, transparent 82%)`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <span style={{ width: 14, height: 14, borderRadius: 7, background: `linear-gradient(135deg, ${m.color}, color-mix(in oklch, ${m.color}, #000 18%))`, boxShadow: `0 0 12px color-mix(in oklch, ${m.color}, transparent 40%)` }} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
                    <span style={{ fontFamily: t.display, fontSize: 15, fontWeight: 700, color: t.text, letterSpacing: -0.2 }}>{m.name}</span>
                    <span style={{ fontFamily: t.mono, fontSize: 13, fontWeight: 700, letterSpacing: 0.2, color: up ? t.good : t.bad }}>{up ? "+" : ""}{m.d}</span>
                  </div>
                  <svg viewBox="0 0 120 22" width="100%" height="22" style={{ marginTop: 4 }} preserveAspectRatio="none">
                    <defs>
                      <linearGradient id={`tr-${m.name}`} x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%" stopColor={m.color} stopOpacity="0.0" />
                        <stop offset="100%" stopColor={m.color} stopOpacity="1" />
                      </linearGradient>
                    </defs>
                    <polyline points={m.trend.map((v, i) => `${(i / (m.trend.length - 1)) * 120},${22 - (v / 100) * 22}`).join(" ")} fill="none" stroke={`url(#tr-${m.name})`} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
                    <circle cx={120} cy={22 - (m.trend[m.trend.length - 1] / 100) * 22} r={3} fill={m.color} stroke={t.bg} strokeWidth={1.2} />
                  </svg>
                </div>
                <div style={{ fontFamily: t.display, fontSize: 22, fontWeight: 800, color: t.text, letterSpacing: -0.6, lineHeight: 1, fontVariantNumeric: "tabular-nums", minWidth: 36, textAlign: "right" }}>{m.score}</div>
              </div>
            );
          })}
        </div>

        {/* AI note */}
        <div style={{ padding: "20px 16px 0" }}>
          <div style={{ padding: 16, borderRadius: 22, background: t.cardBgTint, border: `0.5px solid ${t.line}`, display: "flex", gap: 12 }}>
            <div style={{ width: 28, height: 28, borderRadius: 14, flexShrink: 0, background: t.gradMix, display: "flex", alignItems: "center", justifyContent: "center" }}>
              {AcuityIcons.sparkle({ color: "#fff", size: 15 })}
            </div>
            {/* TODO(copy): placeholder insight. */}
            <p style={{ flex: 1, fontFamily: t.sans, fontSize: 13.5, lineHeight: 1.5, color: t.text, margin: 0, letterSpacing: -0.1, textWrap: "pretty" }}>
              Health slipped while Career climbed. The pattern is familiar — you traded one for the other in week 32, too.
            </p>
          </div>
        </div>
      </div>

      <AcuityTabBar active="insights" t={t} />
    </AcuityDevice>
  );
}
