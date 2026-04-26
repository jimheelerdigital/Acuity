"use client";

import { useEffect, useState } from "react";

import { type CategoryToken } from "./theme-tokens";

// Per-slot gradient palette. Decoupled from category so the four rings
// always read as four DIFFERENT colors even when multiple top themes
// share a category (e.g. three "reflection" themes would otherwise all
// render as identical purple/blue rings).
const SLOT_PALETTE: { from: string; via: string; to: string; solid: string }[] = [
  // Slot 0 — innermost, top theme. Orange → amber (warm, hero).
  { from: "#FB923C", via: "#FBBF24", to: "#FDE68A", solid: "#FB923C" },
  // Slot 1 — pink → rose.
  { from: "#F472B6", via: "#FB7185", to: "#F87171", solid: "#F472B6" },
  // Slot 2 — cyan → teal.
  { from: "#22D3EE", via: "#67E8F9", to: "#A5F3FC", solid: "#22D3EE" },
  // Slot 3 — purple → blue (outermost).
  { from: "#A78BFA", via: "#8B5CF6", to: "#60A5FA", solid: "#A78BFA" },
];

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
  onTap,
}: {
  topThemes: RingTheme[];
  totalMentions: number;
  periods: ThemePeriods;
  timeWindow: ThemeRingsTimeWindow;
  onTap?: (id: string) => void;
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
  const topAccent = SLOT_PALETTE[0].solid;

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
      <div className="flex flex-col items-center gap-4">
      {/* Period eyebrow — above the rings so it doesn't fight the orange
          ring sweep behind. */}
      <p
        style={{
          fontSize: 13,
          letterSpacing: 2.4,
          fontWeight: 600,
          color: "rgba(252,168,90,0.9)",
          textTransform: "uppercase",
        }}
      >
        TOP THEME · {periodPhrase}
      </p>
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
              const p = SLOT_PALETTE[i];
              return (
                <linearGradient
                  key={`grad-${t.id}-${i}`}
                  id={`ring-grad-${i}`}
                  x1="0"
                  y1="0"
                  x2="1"
                  y2="1"
                >
                  <stop offset="0%" stopColor={p.from} />
                  <stop offset="55%" stopColor={p.via} />
                  <stop offset="100%" stopColor={p.to} />
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
            const p = SLOT_PALETTE[i];
            return (
              <circle
                key={`track-${t.id}-${i}`}
                cx={CX}
                cy={CY}
                r={slot.r}
                fill="none"
                stroke={`${p.solid}26`}
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

        </svg>

        {/* centre content — JUST the hero number. Eyebrow lives above
            the rings, theme name + count live below. Keeps the centre
            clean and readable against any ring color. */}
        <div
          className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center"
          style={{ animation: "rings-pulse-num 4s ease-in-out infinite" }}
        >
          <span
            style={{
              fontSize: 80,
              fontWeight: 500,
              color: "#FAFAFA",
              letterSpacing: -2,
              lineHeight: 1,
              textShadow: `0 0 32px ${topAccent}cc, 0 0 12px ${topAccent}`,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {topTheme.count}
          </span>
          <span
            style={{
              display: "none",
              fontSize: 12,
              marginTop: 4,
              color: "rgba(168,168,180,0.7)",
            }}
          >
            {topTheme.count} {topTheme.count === 1 ? "mention" : "mentions"}
          </span>
        </div>
      </div>

      {/* Theme name + count under the rings */}
      <div className="flex flex-col items-center" style={{ gap: 4 }}>
        <span
          style={{
            fontSize: 22,
            fontWeight: 500,
            letterSpacing: -0.3,
            color: "#FAFAFA",
            textAlign: "center",
          }}
        >
          {capitalize(topTheme.name)}
        </span>
        <span
          style={{
            fontSize: 13,
            color: "rgba(168,168,180,0.7)",
          }}
        >
          {topTheme.count} {topTheme.count === 1 ? "mention" : "mentions"} {periodPhrase}
        </span>
      </div>

      {/* Rank list — replaces the in-SVG leader labels. Stays inside
          the left column so nothing overflows into the narrative. */}
      <div
        className="w-full"
        style={{
          maxWidth: 400,
          display: "flex",
          flexDirection: "column",
          gap: 8,
          paddingTop: 16,
          borderTop: "0.5px solid rgba(255,255,255,0.06)",
        }}
      >
        {rings.map((t, i) => {
          const p = SLOT_PALETTE[i];
          const Tag: keyof JSX.IntrinsicElements = onTap ? "button" : "div";
          return (
            <Tag
              key={`rank-${t.id}`}
              onClick={onTap ? () => onTap(t.id) : undefined}
              className={`flex items-center gap-3 rounded-md text-left transition ${
                onTap ? "cursor-pointer hover:bg-white/[0.03]" : ""
              }`}
              style={{
                fontSize: 17,
                paddingTop: 8,
                paddingBottom: 8,
                paddingLeft: 8,
                paddingRight: 8,
              }}
            >
              <span
                aria-hidden
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: 9999,
                  background: p.solid,
                  boxShadow: `0 0 10px ${p.solid}, 0 0 18px ${p.solid}66`,
                  flexShrink: 0,
                }}
              />
              <span
                style={{
                  color: "rgba(168,168,180,0.5)",
                  fontWeight: 600,
                  width: 28,
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {String(i + 1).padStart(2, "0")}
              </span>
              <span
                className="flex-1 truncate"
                style={{
                  color: "#FAFAFA",
                  fontWeight: 500,
                }}
              >
                {capitalize(t.name)}
              </span>
              <span
                style={{
                  color: "rgba(168,168,180,0.85)",
                  fontWeight: 500,
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {t.count}
              </span>
            </Tag>
          );
        })}
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

function capitalize(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}
