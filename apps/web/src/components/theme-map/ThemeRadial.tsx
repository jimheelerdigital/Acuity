"use client";

import { useMemo } from "react";

/**
 * ThemeRadial — web parity for the mobile component. Radial / ring
 * geometry across three rank bands:
 *   Rank 1     → Hero ring card with big 220px ring, share-of-all stat
 *   Ranks 2–5  → 2×2 grid of ring-stat cards (relative to top)
 *   Ranks 6+   → Arc rows with 34px ring encoding relative share
 *
 * Sentiment drives gradient hue. Staggered CSS keyframe entrance.
 */

type SentimentTone = "positive" | "challenging" | "neutral";

export type RadialTheme = {
  id: string;
  name: string;
  mentionCount: number;
  tone: SentimentTone;
};

type ToneStyle = {
  bgGradient: string;
  glowGradient: string;
  ringStart: string;
  ringEnd: string;
  accent: string;
  glow: string;
  numberFg: string;
  shadow: string;
};

const TONE: Record<SentimentTone, ToneStyle> = {
  positive: {
    bgGradient:
      "radial-gradient(120% 95% at 80% 12%, rgba(52,211,153,0.42) 0%, #064E3B 55%, #022C22 100%)",
    glowGradient:
      "radial-gradient(80% 60% at 15% 95%, rgba(110,231,183,0.22) 0%, transparent 70%)",
    ringStart: "#34D399",
    ringEnd: "#6EE7B7",
    accent: "#6EE7B7",
    glow: "#34D399",
    numberFg: "#D1FAE5",
    shadow: "rgba(52,211,153,0.26)",
  },
  neutral: {
    bgGradient:
      "radial-gradient(120% 95% at 80% 12%, rgba(129,140,248,0.42) 0%, #1E1B4B 55%, #0F0D2E 100%)",
    glowGradient:
      "radial-gradient(80% 60% at 15% 95%, rgba(165,180,252,0.22) 0%, transparent 70%)",
    ringStart: "#818CF8",
    ringEnd: "#A5B4FC",
    accent: "#A5B4FC",
    glow: "#818CF8",
    numberFg: "#DBEAFE",
    shadow: "rgba(129,140,248,0.26)",
  },
  challenging: {
    bgGradient:
      "radial-gradient(120% 95% at 80% 12%, rgba(251,113,133,0.42) 0%, #881337 55%, #500724 100%)",
    glowGradient:
      "radial-gradient(80% 60% at 15% 95%, rgba(253,164,175,0.22) 0%, transparent 70%)",
    ringStart: "#FB7185",
    ringEnd: "#FDA4AF",
    accent: "#FDA4AF",
    glow: "#FB7185",
    numberFg: "#FECDD3",
    shadow: "rgba(251,113,133,0.24)",
  },
};

function sentenceCase(s: string): string {
  if (!s) return s;
  const lower = s.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

function entryStyle(index: number): React.CSSProperties {
  const delay = Math.min(index * 45, 520);
  return {
    animation: `radial-enter 360ms cubic-bezier(0.22,1,0.36,1) ${delay}ms both`,
  };
}

export function ThemeRadial({
  themes,
  onTap,
  replayKey = 0,
}: {
  themes: RadialTheme[];
  onTap?: (id: string) => void;
  replayKey?: number | string;
}) {
  const { hero, satellites, rest, heroShare, topCount } = useMemo(() => {
    const hero = themes[0] ?? null;
    const satellites = themes.slice(1, 5);
    const rest = themes.slice(5);
    const total = themes.reduce((s, t) => s + t.mentionCount, 0);
    const heroShare = hero && total > 0 ? hero.mentionCount / total : 0;
    const topCount = hero?.mentionCount ?? 1;
    return { hero, satellites, rest, heroShare, topCount };
  }, [themes]);

  if (!hero) return null;

  return (
    <div className="mt-1">
      <HeroRingCard
        theme={hero}
        share={heroShare}
        index={0}
        replayKey={replayKey}
        onTap={onTap}
      />

      {satellites.length > 0 && (
        <div className="mt-3 grid grid-cols-2 gap-2.5">
          {satellites.map((t, i) => (
            <SatelliteRingCard
              key={`${t.id}-${replayKey}`}
              theme={t}
              rank={i + 2}
              topCount={topCount}
              index={i + 1}
              replayKey={replayKey}
              onTap={onTap}
            />
          ))}
        </div>
      )}

      {rest.length > 0 && (
        <div className="mt-5 flex flex-col gap-2">
          {rest.map((t, i) => (
            <ArcRow
              key={`${t.id}-${replayKey}`}
              theme={t}
              topCount={topCount}
              index={i + 5}
              replayKey={replayKey}
              onTap={onTap}
            />
          ))}
        </div>
      )}

      <style>{`
        @keyframes radial-enter {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}

/**
 * SVG ring component — progress arc sweeping clockwise from 12
 * o'clock. `share` clamped to [minShare, 1] so tiny shares still
 * read as a visible arc.
 */
function Ring({
  size,
  stroke,
  share,
  tone,
  gradientId,
  minShare = 0.08,
  showGlow = true,
}: {
  size: number;
  stroke: number;
  share: number;
  tone: SentimentTone;
  gradientId: string;
  minShare?: number;
  showGlow?: boolean;
}) {
  const t = TONE[tone];
  const cx = size / 2;
  const cy = size / 2;
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const sweepPct = Math.max(minShare, Math.min(share, 1));
  const sweepLen = circumference * sweepPct;
  const gapLen = circumference - sweepLen;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={t.ringStart} />
          <stop offset="100%" stopColor={t.ringEnd} />
        </linearGradient>
      </defs>
      <circle
        cx={cx}
        cy={cy}
        r={r}
        stroke="rgba(255,255,255,0.08)"
        strokeWidth={stroke}
        fill="none"
      />
      {showGlow && (
        <circle
          cx={cx}
          cy={cy}
          r={r}
          stroke={t.glow}
          strokeWidth={stroke + 8}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={`${sweepLen} ${gapLen}`}
          transform={`rotate(-90 ${cx} ${cy})`}
          opacity={0.18}
          style={{ filter: `blur(4px)` }}
        />
      )}
      <circle
        cx={cx}
        cy={cy}
        r={r}
        stroke={`url(#${gradientId})`}
        strokeWidth={stroke}
        strokeLinecap="round"
        fill="none"
        strokeDasharray={`${sweepLen} ${gapLen}`}
        transform={`rotate(-90 ${cx} ${cy})`}
      />
    </svg>
  );
}

function HeroRingCard({
  theme,
  share,
  index,
  replayKey,
  onTap,
}: {
  theme: RadialTheme;
  share: number;
  index: number;
  replayKey: number | string;
  onTap?: (id: string) => void;
}) {
  const tone = TONE[theme.tone];
  const ringSize = 240;
  const ringStroke = 16;

  return (
    <button
      type="button"
      key={`${theme.id}-${replayKey}`}
      onClick={() => onTap?.(theme.id)}
      className="relative block w-full overflow-hidden rounded-3xl border text-left transition-transform hover:scale-[1.005] active:scale-[0.995]"
      style={{
        height: 380,
        borderColor: "rgba(255,255,255,0.08)",
        background: tone.bgGradient,
        boxShadow: `0 16px 40px -8px ${tone.shadow}`,
        ...entryStyle(index),
      }}
    >
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: tone.glowGradient }}
      />

      {/* Top-left pill */}
      <div
        className="absolute left-5 top-5 flex items-center gap-2 rounded-full border px-3 py-1.5"
        style={{
          backgroundColor: "rgba(255,255,255,0.06)",
          borderColor: "rgba(255,255,255,0.08)",
        }}
      >
        <span
          className="inline-block h-1.5 w-1.5 rounded-full"
          style={{
            backgroundColor: tone.accent,
            boxShadow: `0 0 8px ${tone.accent}`,
          }}
        />
        <span
          className="uppercase"
          style={{
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: "1.6px",
            color: tone.accent,
          }}
        >
          Top theme
        </span>
      </div>

      {/* Top-right share stat */}
      <div className="absolute right-5 top-5 text-right">
        <div
          className="tabular-nums"
          style={{
            fontSize: 18,
            fontWeight: 700,
            letterSpacing: "-0.4px",
            color: tone.numberFg,
            lineHeight: 1,
          }}
        >
          {(share * 100).toFixed(0)}%
        </div>
        <div
          className="mt-1 uppercase"
          style={{
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: "1.4px",
            color: "rgba(255,255,255,0.5)",
          }}
        >
          Of all
        </div>
      </div>

      {/* Ring with centered count */}
      <div className="relative flex h-full flex-col items-center justify-center pt-8">
        <div
          className="relative flex items-center justify-center"
          style={{ width: ringSize, height: ringSize }}
        >
          <Ring
            size={ringSize}
            stroke={ringStroke}
            share={share}
            tone={theme.tone}
            gradientId="hero-ring-grad"
            minShare={0.12}
          />
          <div className="absolute flex flex-col items-center">
            <span
              className="tabular-nums text-white"
              style={{
                fontSize: 60,
                fontWeight: 700,
                letterSpacing: "-2px",
                lineHeight: 1,
              }}
            >
              {theme.mentionCount}
            </span>
            <span
              className="mt-1.5 uppercase"
              style={{
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: "1.6px",
                color: tone.accent,
              }}
            >
              {theme.mentionCount === 1 ? "Mention" : "Mentions"}
            </span>
          </div>
        </div>

        <div
          className="mt-3 w-full truncate px-6 text-center text-white"
          style={{
            fontSize: 26,
            fontWeight: 700,
            letterSpacing: "-0.5px",
          }}
        >
          {sentenceCase(theme.name)}
        </div>
      </div>
    </button>
  );
}

function SatelliteRingCard({
  theme,
  rank,
  topCount,
  index,
  replayKey,
  onTap,
}: {
  theme: RadialTheme;
  rank: number;
  topCount: number;
  index: number;
  replayKey: number | string;
  onTap?: (id: string) => void;
}) {
  const tone = TONE[theme.tone];
  const share = topCount > 0 ? theme.mentionCount / topCount : 0;
  const ringSize = 90;
  const ringStroke = 8;
  const rankStr = String(rank).padStart(2, "0");

  return (
    <button
      type="button"
      key={`${theme.id}-${replayKey}`}
      onClick={() => onTap?.(theme.id)}
      className="relative block w-full overflow-hidden rounded-2xl border p-4 text-left transition-transform hover:scale-[1.01] active:scale-[0.99]"
      style={{
        height: 160,
        borderColor: "rgba(255,255,255,0.06)",
        background: tone.bgGradient,
        ...entryStyle(index),
      }}
    >
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: tone.glowGradient }}
      />

      <div
        className="absolute right-3 top-3 rounded-md px-1.5 py-0.5"
        style={{ backgroundColor: "rgba(255,255,255,0.08)" }}
      >
        <span
          style={{
            fontSize: 9,
            letterSpacing: "1.2px",
            color: tone.accent,
            fontWeight: 700,
          }}
        >
          {rankStr}
        </span>
      </div>

      <div className="relative">
        <div
          className="relative flex items-center justify-center"
          style={{ width: ringSize, height: ringSize }}
        >
          <Ring
            size={ringSize}
            stroke={ringStroke}
            share={share}
            tone={theme.tone}
            gradientId={`sat-ring-${theme.id}`}
            minShare={0.1}
            showGlow={false}
          />
          <span
            className="absolute tabular-nums text-white"
            style={{
              fontSize: 24,
              fontWeight: 700,
              letterSpacing: "-0.8px",
              lineHeight: 1,
            }}
          >
            {theme.mentionCount}
          </span>
        </div>
      </div>

      <div
        className="absolute bottom-3 left-4 right-4"
        style={{
          fontSize: 14,
          fontWeight: 700,
          color: "#FAFAFA",
          letterSpacing: "-0.2px",
          lineHeight: 1.2,
          overflow: "hidden",
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical" as const,
        }}
      >
        {sentenceCase(theme.name)}
      </div>
    </button>
  );
}

function ArcRow({
  theme,
  topCount,
  index,
  replayKey,
  onTap,
}: {
  theme: RadialTheme;
  topCount: number;
  index: number;
  replayKey: number | string;
  onTap?: (id: string) => void;
}) {
  const tone = TONE[theme.tone];
  const share = topCount > 0 ? theme.mentionCount / topCount : 0;
  const ringSize = 38;
  const ringStroke = 4;

  return (
    <button
      type="button"
      key={`${theme.id}-${replayKey}`}
      onClick={() => onTap?.(theme.id)}
      className="relative flex w-full items-center gap-3.5 overflow-hidden rounded-2xl border px-4 py-3 text-left transition-colors hover:bg-white/5"
      style={{
        borderColor: "rgba(255,255,255,0.05)",
        backgroundColor: "rgba(24,24,42,0.6)",
        ...entryStyle(index),
      }}
    >
      <div
        className="relative flex shrink-0 items-center justify-center"
        style={{ width: ringSize, height: ringSize }}
      >
        <Ring
          size={ringSize}
          stroke={ringStroke}
          share={share}
          tone={theme.tone}
          gradientId={`row-ring-${theme.id}`}
          minShare={0.1}
          showGlow={false}
        />
        <span
          className="absolute rounded-full"
          style={{
            width: 6,
            height: 6,
            backgroundColor: tone.accent,
          }}
        />
      </div>

      <span
        className="flex-1 truncate text-zinc-50"
        style={{
          fontSize: 15,
          fontWeight: 600,
          letterSpacing: "-0.1px",
        }}
      >
        {sentenceCase(theme.name)}
      </span>

      <span
        style={{
          fontSize: 16,
          fontWeight: 700,
          color: tone.accent,
          letterSpacing: "-0.2px",
        }}
      >
        {theme.mentionCount}
      </span>
    </button>
  );
}
