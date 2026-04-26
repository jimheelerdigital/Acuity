"use client";

import { useEffect, useState } from "react";

import { CATEGORY, type CategoryToken } from "./theme-tokens";

/**
 * Hero rings card — FOUR concentric rings, each ring = one of the top
 * 4 themes for the active period. Each ring's gradient comes from that
 * theme's CATEGORY (activity = orange/amber, reflection = purple/blue,
 * life = cyan, emotional = pink). Innermost ring is the #1 theme and
 * always fills 100%; rings 2-4 fill proportionally to the #1 count
 * (floor 8% so a small count still has a visible arc).
 *
 * 360×360 viewBox, ring radii 64 / 98 / 128 / 156 (gaps ~14-15px).
 * Each ring renders TWICE (glow + crisp). Rotated -90° to start at
 * 12 o'clock. Strokes are round-capped.
 *
 * Center label is the period-aware top-theme readout. Right side of
 * the rings carries narrative ("X is your top theme this month — 24
 * mentions, 31% of total"). Outer rank/name/count leader labels stagger
 * across the 3-o'clock and 9-o'clock sides so they don't collide.
 */

export type RingTheme = {
  id: string;
  name: string;
  category: CategoryToken;
  count: number;
};

export type ThemePeriods = {
  today: { count: number; mood: number };
  week: { count: number; mood: number };
  month: { count: number; mood: number };
};

export type ThemeRingsTimeWindow =
  | "week"
  | "month"
  | "3months"
  | "6months"
  | "all";

const PERIOD_PHRASE: Record<ThemeRingsTimeWindow, string> = {
  week: "this week",
  month: "this month",
  "3months": "this quarter",
  "6months": "the last 6 months",
  all: "all time",
};

const CX = 180;
const CY = 180;

const RING_SLOTS = [
  { r: 64, sw: 22 }, // innermost — top theme
  { r: 98, sw: 18 },
  { r: 128, sw: 14 },
  { r: 156, sw: 12 },
];

export function ThemeRings({
  topThemes,
  totalMentions,
  periods,
  timeWindow,
}: {
  topThemes: RingTheme[];
  totalMentions: number;
  periods: ThemePeriods;
  timeWindow: ThemeRingsTimeWindow;
}) {
  // Cap to 4 — slot order matches RING_SLOTS (innermost is #1).
  const rings = topThemes.slice(0, 4);
  const topTheme = rings[0];

  // Animate dasharray from 0 → target on mount or when the ring set
  // changes (period switch).
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    const start = performance.now();
    const duration = 800;
    let raf = 0;
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3); // approx cubic-bezier(0.2,0.8,0.2,1)
      setProgress(eased);
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [
    rings.map((r) => `${r.id}:${r.count}`).join("|"),
    timeWindow,
  ]);

  if (!topTheme) {
    return (
      <div
        className="rounded-2xl p-8 text-center"
        style={{
          background:
            "linear-gradient(180deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.005) 100%)",
          border: "0.5px solid rgba(255,255,255,0.08)",
        }}
      >
        <p style={{ fontSize: 14, color: "rgba(168,168,180,0.7)" }}>
          No themes yet — record your first reflection to see patterns appear.
        </p>
      </div>
    );
  }

  const topCount = Math.max(1, topTheme.count);
  const periodPhrase = PERIOD_PHRASE[timeWindow];
  const topAccent = CATEGORY[topTheme.category].solid;

  // Stagger leader labels: rings 1+3 to the right, rings 2+4 to the
  // left, slightly offset vertically so they don't collide.
  const leaderPositions: { x: number; y: number; anchor: "start" | "end" }[] = [
    { x: 290, y: 168, anchor: "start" },  // ring 1 (right of innermost)
    { x: 70, y: 168, anchor: "end" },     // ring 2 (left)
    { x: 320, y: 200, anchor: "start" },  // ring 3 (right, lower)
    { x: 40, y: 200, anchor: "end" },     // ring 4 (left, lower)
  ];

  return (
    <div
      className="relative grid grid-cols-1 gap-6 rounded-2xl p-6 sm:grid-cols-[400px_1fr] sm:items-center sm:gap-8 sm:p-7"
      style={{
        background:
          "linear-gradient(180deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.005) 100%)",
        border: "0.5px solid rgba(255,255,255,0.08)",
        boxShadow:
          "inset 0 1px 0 rgba(255,255,255,0.06), 0 24px 60px -36px rgba(0,0,0,0.6)",
      }}
    >
      <div className="relative mx-auto" style={{ width: 400, height: 400 }}>
        {/* background pulsing glow tinted by top theme's category */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background: `radial-gradient(circle, ${topAccent}55 0%, ${topAccent}14 30%, transparent 60%)`,
            filter: "blur(40px)",
            animation: "rings-pulse 4s ease-in-out infinite",
          }}
        />
        <svg
          width={400}
          height={400}
          viewBox="0 0 360 360"
          style={{ overflow: "visible" }}
        >
          <defs>
            {rings.map((t, i) => {
              const c = CATEGORY[t.category];
              return (
                <linearGradient
                  key={`grad-${t.id}-${i}`}
                  id={`ring-grad-${i}`}
                  x1="0"
                  y1="0"
                  x2="1"
                  y2="1"
                >
                  <stop offset="0%" stopColor={c.solid} />
                  <stop offset="55%" stopColor={c.accent} />
                  <stop offset="100%" stopColor={c.accent} stopOpacity={0.85} />
                </linearGradient>
              );
            })}
            <filter id="rings-glow" x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur stdDeviation="6" />
            </filter>
            <radialGradient id="rings-bg-glow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor={topAccent} stopOpacity={0.25} />
              <stop offset="100%" stopColor={topAccent} stopOpacity={0} />
            </radialGradient>
          </defs>

          {/* radial bg-glow */}
          <circle cx={CX} cy={CY} r={170} fill="url(#rings-bg-glow)" />

          {/* tracks (faint) — render all rings first so progress arcs sit on top */}
          {rings.map((t, i) => {
            const slot = RING_SLOTS[i];
            const c = CATEGORY[t.category];
            return (
              <circle
                key={`track-${t.id}-${i}`}
                cx={CX}
                cy={CY}
                r={slot.r}
                fill="none"
                stroke={`${c.solid}26`}
                strokeWidth={slot.sw}
              />
            );
          })}

          {/* glow underlayer + crisp top */}
          {rings.map((t, i) => {
            const slot = RING_SLOTS[i];
            const circumference = 2 * Math.PI * slot.r;
            const ratio = Math.max(0.08, Math.min(1, t.count / topCount));
            const filled = ratio * circumference * progress;
            const dasharray = `${filled} ${circumference - filled}`;
            return (
              <g key={`arc-${t.id}-${i}`}>
                <circle
                  cx={CX}
                  cy={CY}
                  r={slot.r}
                  fill="none"
                  stroke={`url(#ring-grad-${i})`}
                  strokeWidth={slot.sw}
                  strokeLinecap="round"
                  strokeDasharray={dasharray}
                  transform={`rotate(-90 ${CX} ${CY})`}
                  filter="url(#rings-glow)"
                  opacity={0.7}
                />
                <circle
                  cx={CX}
                  cy={CY}
                  r={slot.r}
                  fill="none"
                  stroke={`url(#ring-grad-${i})`}
                  strokeWidth={slot.sw}
                  strokeLinecap="round"
                  strokeDasharray={dasharray}
                  transform={`rotate(-90 ${CX} ${CY})`}
                />
              </g>
            );
          })}

          {/* leader labels — rank · name · count, staggered left/right */}
          {rings.map((t, i) => {
            const slot = RING_SLOTS[i];
            const c = CATEGORY[t.category];
            const pos = leaderPositions[i];
            // Anchor leader line near the ring's outer edge.
            const ringEdgeX =
              pos.anchor === "start"
                ? CX + (slot.r + slot.sw / 2) - 2
                : CX - (slot.r + slot.sw / 2) + 2;
            const lineX2 = pos.anchor === "start" ? pos.x - 8 : pos.x + 8;
            return (
              <g key={`leader-${t.id}-${i}`} opacity={0.85}>
                <line
                  x1={ringEdgeX}
                  y1={CY}
                  x2={lineX2}
                  y2={pos.y - 2}
                  stroke={`${c.solid}66`}
                  strokeWidth={0.8}
                  strokeDasharray="3 4"
                />
                <text
                  x={pos.x}
                  y={pos.y}
                  fontSize={12}
                  fontWeight={500}
                  textAnchor={pos.anchor === "start" ? "start" : "end"}
                  fill="#FAFAFA"
                >
                  <tspan fill="rgba(168,168,180,0.5)" fontWeight={600}>
                    {String(i + 1).padStart(2, "0")}
                  </tspan>
                  <tspan fill="rgba(168,168,180,0.55)">{" · "}</tspan>
                  <tspan>{truncate(capitalize(t.name), 18)}</tspan>
                  <tspan fill="rgba(168,168,180,0.7)">{` · ${t.count}`}</tspan>
                </text>
              </g>
            );
          })}
        </svg>

        {/* centre content */}
        <div
          className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center"
          style={{ animation: "rings-pulse-num 4s ease-in-out infinite" }}
        >
          <span
            style={{
              fontSize: 13,
              letterSpacing: 2,
              fontWeight: 500,
              color: "rgba(252,168,90,0.85)",
              textTransform: "uppercase",
            }}
          >
            TOP THEME · {periodPhrase}
          </span>
          <span
            style={{
              fontSize: 60,
              fontWeight: 500,
              color: "#FAFAFA",
              letterSpacing: -1,
              lineHeight: 1,
              marginTop: 6,
              textShadow: `0 0 24px ${topAccent}99`,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {topTheme.count}
          </span>
          <span
            style={{
              fontSize: 16,
              fontWeight: 500,
              marginTop: 8,
              color: "rgba(228,228,231,0.9)",
              textAlign: "center",
              maxWidth: 200,
            }}
          >
            {capitalize(topTheme.name)}
          </span>
          <span
            style={{
              fontSize: 12,
              marginTop: 4,
              color: "rgba(168,168,180,0.7)",
            }}
          >
            {topTheme.count} {topTheme.count === 1 ? "mention" : "mentions"}
          </span>
        </div>
      </div>

      <NarrativeColumn
        topTheme={topTheme}
        topThemes={rings}
        totalMentions={totalMentions}
        periods={periods}
        periodPhrase={periodPhrase}
      />

      <style jsx>{`
        @keyframes rings-pulse {
          0%, 100% { opacity: 0.85; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.04); }
        }
        @keyframes rings-pulse-num {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.04); }
        }
      `}</style>
    </div>
  );
}

function NarrativeColumn({
  topTheme,
  topThemes,
  totalMentions,
  periods,
  periodPhrase,
}: {
  topTheme: RingTheme;
  topThemes: RingTheme[];
  totalMentions: number;
  periods: ThemePeriods;
  periodPhrase: string;
}) {
  const enoughThemes = topThemes.length >= 3;
  const pct =
    totalMentions > 0
      ? Math.round((topTheme.count / totalMentions) * 100)
      : 0;

  return (
    <div className="min-w-0">
      <p
        className="uppercase"
        style={{
          fontSize: 14,
          letterSpacing: 2,
          fontWeight: 700,
          color: "#FCA85A",
        }}
      >
        What stood out
      </p>
      <h2
        className="mt-2"
        style={{
          fontSize: 28,
          fontWeight: 500,
          letterSpacing: -0.3,
          lineHeight: 1.25,
          color: "#FAFAFA",
        }}
      >
        {enoughThemes ? (
          <>
            <span style={{ fontWeight: 600 }}>{capitalize(topTheme.name)}</span>{" "}
            <span style={gradientText()}>
              is your top theme {periodPhrase}
            </span>
            {" — "}
            {topTheme.count} {topTheme.count === 1 ? "mention" : "mentions"},{" "}
            {pct}% of total.
          </>
        ) : (
          <>
            <span style={{ fontWeight: 600 }}>{capitalize(topTheme.name)}</span>{" "}
            is the only recurring theme {periodPhrase}. Keep journaling to
            surface more patterns.
          </>
        )}
      </h2>
      <div
        className="mt-5 grid grid-cols-3 gap-3"
        style={{ borderTop: "0.5px solid rgba(255,255,255,0.06)", paddingTop: 16 }}
      >
        <PeriodStat label="TODAY" count={periods.today.count} dot="#FB923C" />
        <PeriodStat label="THIS WEEK" count={periods.week.count} dot="#A78BFA" />
        <PeriodStat label="THIS MONTH" count={periods.month.count} dot="#22D3EE" />
      </div>
    </div>
  );
}

function PeriodStat({
  label,
  count,
  dot,
}: {
  label: string;
  count: number;
  dot: string;
}) {
  return (
    <div>
      <div className="flex items-center gap-1.5">
        <span
          aria-hidden
          style={{
            width: 6,
            height: 6,
            borderRadius: 9999,
            background: dot,
            boxShadow: `0 0 8px ${dot}, 0 0 14px ${dot}66`,
          }}
        />
        <span
          style={{
            fontSize: 14,
            letterSpacing: 1.8,
            fontWeight: 700,
            color: "rgba(168,168,180,0.7)",
          }}
        >
          {label}
        </span>
      </div>
      <div
        style={{
          marginTop: 6,
          fontSize: 36,
          fontWeight: 500,
          letterSpacing: -1,
          color: "#FAFAFA",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {count}
      </div>
    </div>
  );
}

function gradientText(): React.CSSProperties {
  return {
    background:
      "linear-gradient(90deg, #FCA85A 0%, #FB923C 50%, #F472B6 100%)",
    WebkitBackgroundClip: "text",
    backgroundClip: "text",
    WebkitTextFillColor: "transparent",
    color: "transparent",
    fontWeight: 600,
  };
}

function truncate(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

function capitalize(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}
