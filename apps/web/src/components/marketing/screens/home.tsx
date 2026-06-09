/**
 * Marketing Home phone-mockup — ported from the design handoff
 * (`marketing_handoff/screen-home.jsx`, HomeDashboard variant) to TS.
 * Static, token-object driven, fixed mode. Renders inside a PhoneFrame
 * in the hero + Feature 1.
 *
 * DRIFT FLAG (2026-06-09): this is a curated marketing mock of the app
 * Home. It intentionally omits live contextual surfaces (trial banner,
 * paywall card, people-this-week, progression checklist). One item is
 * pending Jimmy's call at Batch A QA: the "Life Matrix · 67" ring hero
 * here vs the live home's streak-ring + sparkbar (TodayStatsRow) — the
 * 12-axis Life Matrix currently lives in Insights. See the PR note.
 *
 * HomeRitual + MiniStat from the prototype are not ported (unused by
 * the marketing page).
 */
import type { CSSProperties, ReactNode } from "react";

import type { AcuityTokens } from "@acuity/shared";

import {
  AcuityDevice,
  AcuityIcons,
  AcuityStatus,
  AcuityTabBar,
  AcuityThemePill,
  RingProgress,
  Sparkbar,
} from "./chrome";

// TODO(copy): placeholder demo data for the mockup — not real user stats.
const HOME_DATA = {
  name: "Jordan",
  date: "Wednesday, October 15",
  greet: "Good morning",
  streak: 14,
  longest: 22,
  matrixScore: 67,
  matrixDelta: 5,
  themesThisWeek: 7,
  weekBars: [3, 5, 2, 6, 4, 7, 5],
  minutesSpoken: 312,
  tier: { level: 4, name: "Reflective", xpInLevel: 14, xpToLevel: 21, nextName: "Devoted" },
  achievements: [
    { id: "first", label: "First entry", hue: 60, icon: "trophy", unlocked: true, unlockedAgo: "2mo" },
    { id: "week", label: "7-day chain", hue: 165, icon: "moon", unlocked: true, unlockedAgo: "6w" },
    { id: "goal", label: "Set first goal", hue: 295, icon: "goal", unlocked: true, unlockedAgo: "7w" },
    { id: "two-wk", label: "14 days", hue: 38, icon: "flame", unlocked: true, unlockedAgo: "today" },
    { id: "three-wk", label: "21 days", hue: 195, icon: "star", unlocked: false, progress: 0.66 },
    { id: "matrix-7", label: "Matrix 70+", hue: 80, icon: "matrix", unlocked: false, progress: 0.95 },
  ] as Achievement[],
  lastEntry: {
    when: "Latest",
    durationLabel: "1m 47s",
    summary: "You came back to the Marcus 1:1 you keep deferring, mentioned Mira’s call about Dad, and noticed the run never happened — again.",
    pull: "The thing I keep avoiding is the conversation, not the work.",
    themes: [
      { label: "Career", hue: 295 },
      { label: "Family", hue: 25 },
      { label: "Health", hue: 165 },
    ],
  },
  tasksToday: [
    { text: "Reply to Mira about Dad’s appointment", from: "Family", hue: 25 },
    { text: "Put Marcus 1:1 on the calendar — Friday", from: "Career", hue: 295 },
    { text: "Move the morning run to 6:00 — try again", from: "Health", hue: 165 },
  ],
  weeklyInsight: { dropsIn: "Sun, 8am", preview: "Three patterns are forming." },
};

type HomeData = typeof HOME_DATA;

interface Achievement {
  id: string;
  label: string;
  hue: number;
  icon: string;
  unlocked: boolean;
  unlockedAgo?: string;
  progress?: number;
}

export function HomeDashboard({ t }: { t: AcuityTokens }) {
  const d = HOME_DATA;
  const tier = d.tier;
  return (
    <AcuityDevice t={t}>
      <AcuityStatus dark={t.mode === "dark"} />

      {/* Atmospheric hero glow */}
      <div style={{
        position: "absolute", top: 0, left: 0, right: 0, height: 520,
        background: t.heroGrad, pointerEvents: "none", zIndex: 2,
      }} />

      <div className="acuity-scroll" style={{
        position: "absolute", inset: 0, paddingTop: 56, paddingBottom: 130,
        overflowY: "auto", zIndex: 3,
      }}>
        {/* Top bar — avatar / greeting / tier pill */}
        <div style={{ padding: "18px 18px 0", display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{
            width: 44, height: 44, borderRadius: 22, background: t.gradMix,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontFamily: t.display, fontWeight: 700, fontSize: 17, color: "#fff", letterSpacing: -0.3,
            border: `1.5px solid oklch(1 0 0 / ${t.mode === "dark" ? 0.15 : 0.5})`,
          }}>J</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: t.sans, fontSize: 13, color: t.textTer, letterSpacing: -0.1 }}>{d.greet},</div>
            <div style={{ fontFamily: t.display, fontSize: 20, fontWeight: 700, color: t.text, letterSpacing: -0.4, lineHeight: 1.1 }}>{d.name}.</div>
          </div>
          <div style={{
            display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 3,
            padding: "6px 11px 6px 10px", borderRadius: 14,
            background: t.mode === "dark" ? "oklch(0.28 0.022 280 / 0.8)" : "oklch(1 0 0 / 0.85)",
            border: `0.5px solid ${t.lineStrong}`, backdropFilter: "blur(20px)",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontFamily: t.mono, fontSize: 9, fontWeight: 700, letterSpacing: 0.6, color: t.textTer, textTransform: "uppercase" }}>Lv</span>
              <span style={{
                fontFamily: t.display, fontSize: 18, fontWeight: 800,
                background: t.gradMix, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text",
                letterSpacing: -0.5, lineHeight: 1,
              }}>{tier.level}</span>
            </div>
            <div style={{ fontFamily: t.mono, fontSize: 9, fontWeight: 700, letterSpacing: 0.6, color: t.textSec, textTransform: "uppercase" }}>{tier.name}</div>
          </div>
        </div>

        {/* Today stats — streak ring + entries sparkbar + minutes.
            Matches the LIVE app Home (components/home/today-stats-row).
            Replaces the prototype's "Life Matrix · 67" ring hero, which
            showed a score the app doesn't surface on Home (Life Matrix
            lives in Insights) — live app is source of truth (2026-06-09). */}
        <div style={{ padding: "16px 16px 0" }}>
          <TodayStatsRow t={t} d={d} />
        </div>

        {/* Achievements horizontal scroll */}
        <AchievementStrip t={t} d={d} />

        {/* From last night */}
        <div style={{ padding: "6px 16px 0" }}>
          <div style={{ padding: 18, borderRadius: 24, background: t.cardBg, border: `0.5px solid ${t.line}`, boxShadow: t.shadowSoft }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "5px 10px 5px 8px", borderRadius: 999, background: t.gradMixSoft }}>
                <span style={{ width: 6, height: 6, borderRadius: 3, background: t.primary }} />
                <span style={{ fontFamily: t.mono, fontSize: 10, fontWeight: 700, letterSpacing: 1.0, color: t.text, textTransform: "uppercase" }}>{d.lastEntry.when}</span>
              </div>
              <span style={{ fontFamily: t.mono, fontSize: 11, color: t.textTer }}>{d.lastEntry.durationLabel}</span>
            </div>
            <p style={{ fontFamily: t.display, fontSize: 17, lineHeight: 1.35, fontWeight: 500, letterSpacing: -0.3, color: t.text, margin: "0 0 12px", textWrap: "pretty" }}>{"“"}{d.lastEntry.pull}{"”"}</p>
            <p style={{ fontFamily: t.sans, fontSize: 13.5, lineHeight: 1.5, color: t.textSec, margin: "0 0 14px", textWrap: "pretty" }}>{d.lastEntry.summary}</p>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {d.lastEntry.themes.map((th) => <AcuityThemePill key={th.label} label={th.label} hue={th.hue} t={t} size="s" />)}
            </div>
          </div>
        </div>

        {/* Surfaced today */}
        <div style={{ padding: "20px 16px 0" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "0 4px 10px" }}>
            <h2 style={{ fontFamily: t.display, fontSize: 17, fontWeight: 700, letterSpacing: -0.3, color: t.text, margin: 0 }}>Surfaced today</h2>
            <span style={{ fontFamily: t.mono, fontSize: 11, color: t.textTer }}>3 of 3</span>
          </div>
          <div style={{ borderRadius: 22, background: t.cardBg, border: `0.5px solid ${t.line}`, overflow: "hidden", boxShadow: t.shadowSoft }}>
            {d.tasksToday.map((task, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 14px", borderTop: i === 0 ? "none" : `0.5px solid ${t.line}` }}>
                <div style={{ width: 22, height: 22, borderRadius: 11, flexShrink: 0, border: `1.5px solid ${t.mode === "dark" ? "oklch(1 0 0 / 0.20)" : "oklch(0 0 0 / 0.20)"}` }} />
                <div style={{ fontFamily: t.sans, fontSize: 15, color: t.text, letterSpacing: -0.2, lineHeight: 1.3, flex: 1, minWidth: 0 }}>{task.text}</div>
                <span style={{
                  fontFamily: t.mono, fontSize: 10, fontWeight: 700, letterSpacing: 0.6, padding: "3px 8px", borderRadius: 999,
                  background: `oklch(0.65 0.14 ${task.hue} / 0.16)`,
                  color: `oklch(${t.mode === "dark" ? 0.78 : 0.55} 0.13 ${task.hue})`, textTransform: "uppercase",
                }}>{task.from}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Weekly insight teaser */}
        <div style={{ padding: "20px 16px 0" }}>
          <div style={{
            position: "relative", overflow: "hidden", borderRadius: 24, padding: 18,
            background: t.mode === "dark"
              ? `linear-gradient(135deg, oklch(0.28 0.10 ${t._secondary[2]} / 0.4) 0%, ${t.cardBg} 80%)`
              : `linear-gradient(135deg, oklch(0.96 0.05 ${t._secondary[2]}) 0%, ${t.cardBg} 80%)`,
            border: `0.5px solid ${t.lineStrong}`, boxShadow: t.shadowSoft,
          }}>
            <div style={{
              position: "absolute", right: -30, bottom: -30, width: 120, height: 120, borderRadius: "50%",
              background: `radial-gradient(circle, ${t.secondary} 0%, transparent 70%)`,
              opacity: t.mode === "dark" ? 0.16 : 0.24, filter: "blur(22px)", pointerEvents: "none",
            }} />
            <div style={{ display: "flex", alignItems: "center", gap: 12, position: "relative" }}>
              <div style={{ width: 44, height: 44, borderRadius: 14, background: t.gradSecondary, display: "flex", alignItems: "center", justifyContent: "center" }}>
                {AcuityIcons.sparkle({ color: "#fff", size: 20 })}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontFamily: t.mono, fontSize: 10, fontWeight: 700, letterSpacing: 1.0, color: t.textTer, textTransform: "uppercase" }}>Weekly insight</span>
                  <span style={{ padding: "2px 7px", borderRadius: 999, background: t.gradSecondary, fontFamily: t.mono, fontSize: 9, fontWeight: 700, color: "#fff", letterSpacing: 0.5, textTransform: "uppercase" }}>Pro</span>
                </div>
                <div style={{ fontFamily: t.display, fontSize: 16, fontWeight: 700, color: t.text, letterSpacing: -0.3, marginTop: 4, lineHeight: 1.25 }}>{d.weeklyInsight.preview}</div>
                <div style={{ fontFamily: t.sans, fontSize: 12, color: t.textTer, marginTop: 4 }}>Unwraps {d.weeklyInsight.dropsIn}</div>
              </div>
              {AcuityIcons.chevron({ color: t.textTer })}
            </div>
          </div>
        </div>
      </div>

      <AcuityTabBar active="home" t={t} />
    </AcuityDevice>
  );
}

// Mirrors the live app Home's TodayStatsRow
// (apps/mobile/components/home/today-stats-row.tsx): three tiles —
// streak ring, entries-this-week sparkbar, minutes. Static (no count-up
// / streak-floater animation — those are live-app-only).
function TodayStatsRow({ t, d }: { t: AcuityTokens; d: HomeData }) {
  // Ring fills "progress to your best": streak / max(longest, 7).
  const ringMax = Math.max(d.longest, 7);
  const ringValue = Math.min(1, d.streak / ringMax);
  const entries = d.weekBars.reduce((a, b) => a + b, 0);

  const tile: CSSProperties = {
    flex: 1, padding: 14, borderRadius: 22, background: t.cardBg,
    border: `0.5px solid ${t.line}`, display: "flex", flexDirection: "column", gap: 8,
  };
  const num: CSSProperties = {
    fontFamily: t.display, fontSize: 26, fontWeight: 800, letterSpacing: -0.6,
    lineHeight: "28px", color: t.text, fontVariantNumeric: "tabular-nums",
  };
  const label: CSSProperties = {
    fontFamily: t.mono, fontSize: 10, fontWeight: 700, letterSpacing: 1.2,
    textTransform: "uppercase", color: t.textTer,
  };

  return (
    <div style={{ display: "flex", gap: 10, alignItems: "stretch" }}>
      {/* Streak ring */}
      <div style={{ ...tile, alignItems: "center" }}>
        <RingProgress value={ringValue} size={72} stroke={6} t={t}>
          <div style={{ ...num, lineHeight: "26px" }}>{d.streak}</div>
        </RingProgress>
        <div style={label}>Streak · {d.streak === 1 ? "day" : "days"}</div>
      </div>
      {/* Entries this week */}
      <div style={{ ...tile, justifyContent: "space-between" }}>
        <div>
          <div style={num}>{entries}</div>
          <div style={{ ...label, marginTop: 2 }}>Entries · 7d</div>
        </div>
        <Sparkbar values={d.weekBars} t={t} height={28} />
      </div>
      {/* Minutes */}
      <div style={{ ...tile, justifyContent: "center", alignItems: "center" }}>
        <div style={num}>{d.minutesSpoken}</div>
        <div style={{ ...label, textAlign: "center" }}>minutes</div>
      </div>
    </div>
  );
}

const ACH_ICONS: Record<string, (c: string, s: number) => ReactNode> = {
  trophy: (c, s) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M6 4h12v4a6 6 0 0 1-12 0V4z" /><path d="M6 6H3a3 3 0 0 0 3 3M18 6h3a3 3 0 0 1-3 3M9 18h6M10 14v4M14 14v4M8 21h8" /></svg>,
  moon: (c, s) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.5A9 9 0 1 1 11.5 3a7 7 0 0 0 9.5 9.5z" /></svg>,
  goal: (c, s) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1.4" fill={c} stroke="none" /></svg>,
  flame: (c, s) => <svg width={s} height={s} viewBox="0 0 24 24" fill={c}><path d="M12 2.5c.5 3 3 4.3 3 7.4 0 1.8-1 3.2-2.4 3.2-1 0-1.7-.6-1.7-1.5 0-1.2.9-1.4.9-2.6 0-1-.8-1.4-1.5-.5-1.8 2-2.8 3.7-2.8 5.9C7.5 17.6 9.6 20 12 20s4.5-2.4 4.5-5.6c0-4.8-4.5-6.6-4.5-11.9z" /></svg>,
  star: (c, s) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l2.7 5.6 6.3 1-4.5 4.4 1 6.2L12 17.5 6.5 20.2l1-6.2L3 9.6l6.3-1L12 3z" /></svg>,
  matrix: (c, s) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polygon points="12,3 21,9 18,20 6,20 3,9" /><polygon points="12,8 17,11 15,17 9,17 7,11" fill={c} fillOpacity="0.25" /></svg>,
};

function AchievementStrip({ t, d }: { t: AcuityTokens; d: HomeData }) {
  return (
    <div style={{ marginTop: 18 }}>
      <div style={{ padding: "0 20px 10px", display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <h2 style={{ fontFamily: t.display, fontSize: 13, fontWeight: 700, color: t.textSec, letterSpacing: 0.4, textTransform: "uppercase", margin: 0 }}>Achievements</h2>
        <span style={{ fontFamily: t.mono, fontSize: 11, color: t.textTer }}>
          {d.achievements.filter((a) => a.unlocked).length}/{d.achievements.length}
        </span>
      </div>
      <div className="acuity-scroll" style={{ display: "flex", gap: 10, padding: "0 16px 4px", overflowX: "auto" }}>
        {d.achievements.map((a) => <AchievementMedal key={a.id} t={t} a={a} />)}
      </div>
    </div>
  );
}

function AchievementMedal({ t, a }: { t: AcuityTokens; a: Achievement }) {
  const Icon = ACH_ICONS[a.icon] || ACH_ICONS.star;
  const tintBg = a.unlocked
    ? `linear-gradient(160deg, oklch(0.32 0.10 ${a.hue} / ${t.mode === "dark" ? 0.42 : 0.0}) 0%, ${t.cardBg} 80%)`
    : t.cardBg;
  const lightTintBg = a.unlocked && t.mode === "light"
    ? `linear-gradient(160deg, oklch(0.96 0.07 ${a.hue}) 0%, ${t.cardBg} 80%)`
    : tintBg;
  const bg = t.mode === "dark" ? tintBg : lightTintBg;
  return (
    <div style={{
      flexShrink: 0, width: 120, padding: "12px 12px 10px", borderRadius: 18, background: bg,
      border: `0.5px solid ${t.line}`, boxShadow: t.shadowSoft, position: "relative", overflow: "hidden",
      opacity: a.unlocked ? 1 : 0.78,
    }}>
      <div style={{
        width: 36, height: 36, borderRadius: 18,
        background: a.unlocked
          ? `linear-gradient(135deg, oklch(0.78 0.16 ${a.hue}), oklch(0.55 0.16 ${a.hue}))`
          : t.mode === "dark" ? "oklch(1 0 0 / 0.06)" : "oklch(0 0 0 / 0.05)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        {Icon(a.unlocked ? "#fff" : t.textTer, 18)}
      </div>
      <div style={{ fontFamily: t.display, fontSize: 13, fontWeight: 700, color: t.text, letterSpacing: -0.2, marginTop: 10, lineHeight: 1.2, textWrap: "pretty" }}>{a.label}</div>
      {a.unlocked ? (
        <div style={{ fontFamily: t.mono, fontSize: 10, color: t.textTer, marginTop: 4, letterSpacing: 0.3 }}>{a.unlockedAgo === "today" ? "JUST NOW" : (a.unlockedAgo || "").toUpperCase()}</div>
      ) : (
        <div style={{ marginTop: 4 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontFamily: t.mono, fontSize: 9, color: t.textTer, letterSpacing: 0.4, marginBottom: 3, fontWeight: 700 }}>
            <span>LOCKED</span>
            <span>{Math.round((a.progress || 0) * 100)}%</span>
          </div>
          <div style={{ height: 3, borderRadius: 2, overflow: "hidden", background: t.mode === "dark" ? "oklch(1 0 0 / 0.08)" : "oklch(0 0 0 / 0.07)" }}>
            <div style={{ height: "100%", width: `${(a.progress || 0) * 100}%`, background: `oklch(0.78 0.16 ${a.hue})`, borderRadius: 2 }} />
          </div>
        </div>
      )}
    </div>
  );
}
