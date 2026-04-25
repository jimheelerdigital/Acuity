"use client";

import { useMemo } from "react";

/**
 * Theme Map dashboard composition. References: dark-navy fitness/finance
 * dashboard art with hero gradient rings, smooth wave charts with
 * gradient fills, tile grids with sparklines, and frequency spectrum
 * bars — all on one screen, layered.
 *
 * Visual vocabulary (matching the reference screenshots' execution):
 *   - Strokes glow. Every gradient line gets feGaussianBlur halo + 3pt
 *     stroke weight so it reads as light, not as a hairline.
 *   - Numbers are typographic heroes. Hero ring count is 88-96pt at
 *     800 weight with tabular-nums; tile counts are 44-52pt at 800.
 *   - Cards have inner top-edge highlight (1px lighter line) + outer
 *     glow shadow, so they feel lifted off the canvas.
 *   - Page background is a deep vertical gradient (slightly lighter at
 *     top, deeper at bottom) plus a large radial glow tinted by the
 *     top theme's sentiment colour.
 *
 * Low-data behaviour:
 *   - Wave chart with <5 active days renders a dashed baseline horizon
 *     plus dot-markers at recording dates and a soft "your trend fills
 *     in as you record" caption — instead of looking like a broken
 *     chart with peaks slammed against the right edge.
 *   - Tile sparklines with <2 active points render an em-dash inside
 *     the tile rather than a confusing single-pixel spike.
 *   - Wave callouts auto-anchor: peaks in the right 30% of the chart
 *     get their pill rendered to the LEFT of the dot so it doesn't
 *     overflow the chart edge.
 *
 * Layers (top → bottom):
 *   1. Hero ring + narrative panel
 *   2. Wave chart with peak callout (or low-data state)
 *   3. Tile grid (themes 1-6) with mini sparkline + sentiment dot
 *   4. Frequency spectrum (themes 7-15) as gradient bars
 *
 * All graphics are raw SVG — no chart library — so the gradient + glow
 * vocabulary stays consistent across every element.
 */

export type SentimentTone = "positive" | "challenging" | "neutral";

export type DashboardTheme = {
  id: string;
  name: string;
  mentionCount: number;
  tone: SentimentTone;
  sparkline: number[];
  trendDescription: string;
  firstMentionedDaysAgo: number;
};

type Gradient = {
  from: string;
  via: string;
  to: string;
  glow: string;
  soft: string;
};

const SENTIMENT: Record<SentimentTone, Gradient> = {
  positive: {
    from: "#FB923C",
    via: "#FBBF24",
    to: "#FDE68A",
    glow: "rgba(251,146,60,0.55)",
    soft: "#FCD34D",
  },
  neutral: {
    from: "#A78BFA",
    via: "#60A5FA",
    to: "#22D3EE",
    glow: "rgba(96,165,250,0.55)",
    soft: "#93C5FD",
  },
  challenging: {
    from: "#F472B6",
    via: "#FB7185",
    to: "#F87171",
    glow: "rgba(244,114,182,0.55)",
    soft: "#FDA4AF",
  },
};

const PERIOD_LABEL: Record<string, string> = {
  week: "this week",
  month: "this month",
  "3months": "the last 3 months",
  "6months": "the last 6 months",
  all: "across all your sessions",
};

const TABULAR: React.CSSProperties = {
  fontVariantNumeric: "tabular-nums",
};

export function ThemeMapDashboard({
  themes,
  totalMentions,
  timeWindow,
  onTap,
}: {
  themes: DashboardTheme[];
  totalMentions: number;
  timeWindow: string;
  onTap?: (id: string) => void;
}) {
  const top = themes[0];
  const tilesRow = themes.slice(0, 6);
  const longTail = themes.slice(6, 15);
  const periodLabel = PERIOD_LABEL[timeWindow] ?? PERIOD_LABEL.month;

  if (!top) {
    return (
      <div className="my-12 text-center text-sm text-zinc-500 dark:text-zinc-400">
        Not enough themes yet — record a few more sessions and they&rsquo;ll
        start showing up here.
      </div>
    );
  }

  return (
    <div
      className="relative isolate overflow-hidden rounded-3xl"
      style={{
        // Vertical page gradient — slightly lit at top, deeper at
        // bottom. Matches the reference screenshots' atmospheric
        // depth (canvas isn't flat black).
        background:
          "linear-gradient(180deg, #0E0E1C 0%, #08080F 60%, #06060D 100%)",
        boxShadow:
          "inset 0 1px 0 rgba(255,255,255,0.04), 0 30px 80px -40px rgba(0,0,0,0.8)",
      }}
    >
      <Atmosphere tone={top.tone} />
      <div className="relative space-y-7 px-5 py-7 sm:px-7 sm:py-8">
        <HeroRingPanel
          top={top}
          themes={themes}
          totalMentions={totalMentions}
          periodLabel={periodLabel}
        />
        <WaveChart themes={themes.slice(0, 3)} />
        <TileGrid themes={tilesRow} onTap={onTap} />
        {longTail.length > 0 && <FrequencySpectrum themes={longTail} />}
      </div>
      <style>{`
        @keyframes acuity-pulse {
          0%, 100% { transform: scale(0.985); }
          50% { transform: scale(1.018); }
        }
        @keyframes acuity-glow-drift {
          0%, 100% { transform: rotate(0deg) scale(1); opacity: 0.85; }
          50% { transform: rotate(180deg) scale(1.06); opacity: 1; }
        }
        @keyframes acuity-shimmer {
          0% { stroke-dashoffset: 0; }
          100% { stroke-dashoffset: -240; }
        }
        .acuity-tile { transition: transform 220ms ease, box-shadow 220ms ease, border-color 220ms ease; }
        .acuity-tile:hover { transform: translateY(-2px); }
      `}</style>
    </div>
  );
}

// ─── Atmosphere ────────────────────────────────────────────────────

function Atmosphere({ tone }: { tone: SentimentTone }) {
  const g = SENTIMENT[tone];
  return (
    <>
      <div
        aria-hidden
        className="pointer-events-none absolute -top-44 left-1/2 -translate-x-1/2"
        style={{
          width: 820,
          height: 820,
          borderRadius: 9999,
          background: `radial-gradient(circle, ${g.from}3a 0%, ${g.via}24 28%, ${g.to}10 50%, transparent 70%)`,
          filter: "blur(50px)",
          animation: "acuity-glow-drift 9s ease-in-out infinite",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-40 -right-32"
        style={{
          width: 460,
          height: 460,
          borderRadius: 9999,
          background: `radial-gradient(circle, ${g.to}26 0%, transparent 70%)`,
          filter: "blur(50px)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-20 -left-24"
        style={{
          width: 320,
          height: 320,
          borderRadius: 9999,
          background: `radial-gradient(circle, ${g.from}14 0%, transparent 65%)`,
          filter: "blur(60px)",
        }}
      />
    </>
  );
}

// ─── Card chrome (re-used) ─────────────────────────────────────────

const CARD_STYLE: React.CSSProperties = {
  background:
    "linear-gradient(180deg, rgba(255,255,255,0.025) 0%, rgba(255,255,255,0.005) 100%)",
  border: "1px solid rgba(255,255,255,0.06)",
  // Inner top highlight + outer drop shadow for "lifted" depth.
  boxShadow:
    "inset 0 1px 0 rgba(255,255,255,0.07), inset 0 0 0 1px rgba(255,255,255,0.02), 0 24px 60px -36px rgba(0,0,0,0.6)",
};

// ─── Hero ring + narrative ─────────────────────────────────────────

function HeroRingPanel({
  top,
  themes,
  totalMentions,
  periodLabel,
}: {
  top: DashboardTheme;
  themes: DashboardTheme[];
  totalMentions: number;
  periodLabel: string;
}) {
  const g = SENTIMENT[top.tone];
  const share = totalMentions > 0 ? top.mentionCount / totalMentions : 0;
  const sharePct = Math.round(share * 100);
  const second = themes[1];
  const ratioCopy =
    second && second.mentionCount > 0
      ? top.mentionCount >= second.mentionCount * 2
        ? `${Math.round(top.mentionCount / second.mentionCount)}× more often than anything else`
        : `the leading thread you keep returning to`
      : `the only recurring thread so far`;

  return (
    <div
      className="relative grid grid-cols-1 gap-6 rounded-2xl p-6 backdrop-blur-sm sm:grid-cols-[220px_1fr] sm:items-center sm:gap-8 sm:p-7"
      style={CARD_STYLE}
    >
      <HeroRing share={share} count={top.mentionCount} tone={top.tone} />
      <div className="min-w-0">
        <p
          className="uppercase"
          style={{
            fontSize: 10,
            letterSpacing: 2.4,
            fontWeight: 700,
            color: g.soft,
          }}
        >
          What stood out
        </p>
        <h2
          className="mt-2 text-zinc-50"
          style={{
            fontSize: 24,
            fontWeight: 700,
            letterSpacing: -0.4,
            lineHeight: 1.2,
            background: `linear-gradient(135deg, #FAFAFA 0%, ${g.to} 90%)`,
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
            WebkitTextFillColor: "transparent",
            color: "transparent",
          }}
        >
          {capitalize(top.name)} came up {top.mentionCount}{" "}
          {top.mentionCount === 1 ? "time" : "times"} {periodLabel}.
        </h2>
        <p
          className="mt-2.5"
          style={{
            fontSize: 14,
            lineHeight: 1.55,
            color: "rgba(228,228,231,0.78)",
          }}
        >
          {top.trendDescription === "New theme"
            ? "Brand new this period — "
            : ""}
          {ratioCopy}.{" "}
          <span style={{ color: g.soft, fontWeight: 600, ...TABULAR }}>
            {sharePct}%
          </span>{" "}
          of every theme you mentioned.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Badge tone={top.tone}>{top.trendDescription}</Badge>
          <span
            style={{ fontSize: 12, color: "rgba(161,161,170,0.7)", ...TABULAR }}
          >
            {top.firstMentionedDaysAgo === 0
              ? "first surfaced today"
              : `first surfaced ${top.firstMentionedDaysAgo}d ago`}
          </span>
        </div>
      </div>
    </div>
  );
}

function HeroRing({
  share,
  count,
  tone,
}: {
  share: number;
  count: number;
  tone: SentimentTone;
}) {
  const g = SENTIMENT[tone];
  const size = 220;
  const cx = size / 2;
  const cy = size / 2;
  const r = 86;
  const trackR = 100;
  const circumference = 2 * Math.PI * r;
  const dash = circumference * Math.max(0.04, Math.min(1, share));
  const id = useMemo(() => Math.random().toString(36).slice(2, 9), []);

  return (
    <div
      className="relative mx-auto flex items-center justify-center"
      style={{ width: size, height: size }}
    >
      {/* outer halo glow — sits behind the SVG and breathes */}
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background: `radial-gradient(circle at 50% 50%, ${g.glow} 0%, ${g.from}26 35%, transparent 65%)`,
          filter: "blur(22px)",
          animation: "acuity-pulse 4s ease-in-out infinite",
        }}
      />
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        style={{ overflow: "visible" }}
        aria-hidden
      >
        <defs>
          <linearGradient id={`ring-${id}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={g.from} />
            <stop offset="55%" stopColor={g.via} />
            <stop offset="100%" stopColor={g.to} />
          </linearGradient>
          <radialGradient id={`fill-${id}`} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={g.from} stopOpacity={0.18} />
            <stop offset="80%" stopColor={g.from} stopOpacity={0} />
          </radialGradient>
          <filter
            id={`glow-${id}`}
            x="-30%"
            y="-30%"
            width="160%"
            height="160%"
          >
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        {/* outer faint ring */}
        <circle
          cx={cx}
          cy={cy}
          r={trackR}
          fill="none"
          stroke="rgba(255,255,255,0.04)"
          strokeWidth={1}
        />
        {/* track */}
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill={`url(#fill-${id})`}
          stroke="rgba(255,255,255,0.06)"
          strokeWidth={11}
        />
        {/* progress arc — glowing */}
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke={`url(#ring-${id})`}
          strokeWidth={11}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circumference - dash}`}
          transform={`rotate(-90 ${cx} ${cy})`}
          filter={`url(#glow-${id})`}
        />
        {/* tick markers around outer ring */}
        {Array.from({ length: 32 }).map((_, i) => {
          const a = (i / 32) * Math.PI * 2;
          const x1 = cx + Math.cos(a) * (trackR + 5);
          const y1 = cy + Math.sin(a) * (trackR + 5);
          const x2 = cx + Math.cos(a) * (trackR + 11);
          const y2 = cy + Math.sin(a) * (trackR + 11);
          return (
            <line
              key={i}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke="rgba(255,255,255,0.07)"
              strokeWidth={1}
            />
          );
        })}
      </svg>
      <div
        className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center"
        style={{ animation: "acuity-pulse 3.5s ease-in-out infinite" }}
      >
        <span
          style={{
            fontSize: 78,
            fontWeight: 800,
            color: "#FAFAFA",
            letterSpacing: -3,
            lineHeight: 1,
            textShadow: `0 0 24px ${g.glow}`,
            ...TABULAR,
          }}
        >
          {count}
        </span>
        <span
          style={{
            fontSize: 10,
            marginTop: 6,
            fontWeight: 700,
            letterSpacing: 1.6,
            color: g.soft,
            textTransform: "uppercase",
          }}
        >
          mentions
        </span>
      </div>
    </div>
  );
}

function Badge({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone: SentimentTone;
}) {
  const g = SENTIMENT[tone];
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1"
      style={{
        background: `linear-gradient(90deg, ${g.from}30 0%, ${g.to}1a 100%)`,
        border: `1px solid ${g.from}55`,
        fontSize: 11,
        fontWeight: 600,
        color: g.soft,
        letterSpacing: 0.2,
        boxShadow: `0 0 18px -4px ${g.glow}`,
      }}
    >
      <span
        aria-hidden
        style={{
          width: 6,
          height: 6,
          borderRadius: 9999,
          background: g.from,
          boxShadow: `0 0 8px ${g.from}, 0 0 16px ${g.glow}`,
        }}
      />
      {children}
    </span>
  );
}

// ─── Wave chart with smart low-data state ──────────────────────────

function WaveChart({ themes }: { themes: DashboardTheme[] }) {
  const id = useMemo(() => Math.random().toString(36).slice(2, 9), []);
  const W = 640;
  const H = 200;
  const PAD_X = 18;
  const PAD_TOP = 32;
  const PAD_BOT = 28;
  const innerW = W - PAD_X * 2;
  const innerH = H - PAD_TOP - PAD_BOT;

  const days = themes[0]?.sparkline.length ?? 30;
  const maxAcross = Math.max(1, ...themes.flatMap((t) => t.sparkline));

  // Active days = sum of mentions across all themes per day index, > 0.
  const combinedActive = countActiveDays(
    themes.flatMap((t) => t.sparkline),
    days
  );
  const isLowData = combinedActive < 5;

  return (
    <div className="rounded-2xl p-4 sm:p-5" style={CARD_STYLE}>
      <div className="mb-3 flex items-baseline justify-between">
        <p
          className="uppercase"
          style={{
            fontSize: 10,
            letterSpacing: 2.4,
            fontWeight: 700,
            color: "rgba(228,228,231,0.55)",
          }}
        >
          Trend · last {days} days
        </p>
        <div className="flex flex-wrap items-center gap-3">
          {themes.map((t) => (
            <span
              key={t.id}
              className="inline-flex items-center gap-1.5"
              style={{ fontSize: 11, color: "rgba(228,228,231,0.7)" }}
            >
              <span
                aria-hidden
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 9999,
                  background: SENTIMENT[t.tone].from,
                  boxShadow: `0 0 8px ${SENTIMENT[t.tone].from}, 0 0 16px ${SENTIMENT[t.tone].glow}`,
                }}
              />
              {t.name}
            </span>
          ))}
        </div>
      </div>
      <div className="relative w-full overflow-hidden">
        <svg
          width="100%"
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          style={{ display: "block", height: 200 }}
          aria-hidden
        >
          <defs>
            <filter
              id={`wave-glow-${id}`}
              x="-20%"
              y="-50%"
              width="140%"
              height="200%"
            >
              <feGaussianBlur stdDeviation="2.4" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            {themes.map((t, i) => {
              const g = SENTIMENT[t.tone];
              return (
                <g key={t.id}>
                  <linearGradient
                    id={`stroke-${id}-${i}`}
                    x1="0"
                    x2="1"
                    y1="0"
                    y2="0"
                  >
                    <stop offset="0%" stopColor={g.from} />
                    <stop offset="50%" stopColor={g.via} />
                    <stop offset="100%" stopColor={g.to} />
                  </linearGradient>
                  <linearGradient
                    id={`fill-${id}-${i}`}
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop offset="0%" stopColor={g.from} stopOpacity={0.34} />
                    <stop offset="100%" stopColor={g.from} stopOpacity={0} />
                  </linearGradient>
                </g>
              );
            })}
          </defs>
          {/* horizontal grid */}
          {[0.25, 0.5, 0.75].map((p) => {
            const y = PAD_TOP + innerH * p;
            return (
              <line
                key={p}
                x1={PAD_X}
                x2={W - PAD_X}
                y1={y}
                y2={y}
                stroke="rgba(255,255,255,0.04)"
                strokeWidth={1}
              />
            );
          })}
          {/* baseline lane */}
          <line
            x1={PAD_X}
            x2={W - PAD_X}
            y1={H - PAD_BOT}
            y2={H - PAD_BOT}
            stroke="rgba(255,255,255,0.1)"
            strokeWidth={1}
            strokeDasharray={isLowData ? "4 6" : "2 4"}
          />

          {isLowData ? (
            <LowDataMarkers
              themes={themes}
              days={days}
              W={W}
              H={H}
              PAD_X={PAD_X}
              PAD_BOT={PAD_BOT}
              filterId={`wave-glow-${id}`}
            />
          ) : (
            <FullWavePaths
              themes={themes}
              W={W}
              H={H}
              PAD_X={PAD_X}
              PAD_TOP={PAD_TOP}
              PAD_BOT={PAD_BOT}
              innerW={innerW}
              innerH={innerH}
              maxAcross={maxAcross}
              gradientIdPrefix={id}
              filterId={`wave-glow-${id}`}
            />
          )}
        </svg>
        {isLowData && (
          <p
            className="absolute left-0 right-0 text-center"
            style={{
              bottom: 8,
              fontSize: 11,
              letterSpacing: 0.6,
              color: "rgba(228,228,231,0.5)",
            }}
          >
            Your trend fills in as you record.
          </p>
        )}
      </div>
    </div>
  );
}

function FullWavePaths({
  themes,
  W,
  H,
  PAD_X,
  PAD_TOP,
  PAD_BOT,
  innerW,
  innerH,
  maxAcross,
  gradientIdPrefix,
  filterId,
}: {
  themes: DashboardTheme[];
  W: number;
  H: number;
  PAD_X: number;
  PAD_TOP: number;
  PAD_BOT: number;
  innerW: number;
  innerH: number;
  maxAcross: number;
  gradientIdPrefix: string;
  filterId: string;
}) {
  const series = themes.map((t) => {
    const path = smoothPath(
      t.sparkline,
      innerW,
      innerH,
      PAD_X,
      PAD_TOP,
      maxAcross
    );
    return { theme: t, ...path };
  });
  const top = series[0];
  const peak = top
    ? findPeak(top.theme.sparkline, innerW, innerH, PAD_X, PAD_TOP, maxAcross)
    : null;

  // Auto-anchor the callout pill: if the peak is in the right 30% of
  // the chart, render the pill to the LEFT of the dot so it doesn't
  // overflow. Otherwise to the right. Same for vertical edge clamps.
  const PILL_W = 96;
  const PILL_H = 30;
  let pillX = 0;
  let pillY = 0;
  let connectorX = 0;
  if (peak) {
    const anchorRight = peak.x > W - PAD_X - PILL_W - 24;
    pillX = anchorRight ? peak.x - PILL_W - 14 : peak.x + 14;
    pillY = Math.max(4, Math.min(peak.y - PILL_H / 2 - 18, H - PILL_H - 4));
    connectorX = anchorRight ? peak.x - 6 : peak.x + 6;
  }

  return (
    <>
      {/* fills (back to front) */}
      {series.map((s, i) => (
        <path
          key={`fill-${s.theme.id}`}
          d={s.area}
          fill={`url(#fill-${gradientIdPrefix}-${i})`}
        />
      ))}
      {/* glowing strokes */}
      {series.map((s, i) => (
        <path
          key={`stroke-${s.theme.id}`}
          d={s.line}
          fill="none"
          stroke={`url(#stroke-${gradientIdPrefix}-${i})`}
          strokeWidth={i === 0 ? 3.2 : 2.4}
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={i === 0 ? 1 : 0.78}
          filter={`url(#${filterId})`}
        />
      ))}
      {/* peak callout */}
      {peak && top && (
        <g>
          {/* connecting line + outer halo dot */}
          <line
            x1={peak.x}
            y1={peak.y}
            x2={connectorX}
            y2={pillY + PILL_H / 2}
            stroke={SENTIMENT[top.theme.tone].from}
            strokeOpacity={0.5}
            strokeWidth={1}
          />
          <circle
            cx={peak.x}
            cy={peak.y}
            r={11}
            fill={SENTIMENT[top.theme.tone].from}
            opacity={0.22}
          />
          <circle
            cx={peak.x}
            cy={peak.y}
            r={5.5}
            fill={SENTIMENT[top.theme.tone].from}
            stroke="#FAFAFA"
            strokeWidth={1.5}
            filter={`url(#${filterId})`}
          />
          {/* pill */}
          <g transform={`translate(${pillX}, ${pillY})`}>
            <rect
              x={0}
              y={0}
              width={PILL_W}
              height={PILL_H}
              rx={8}
              fill={`${SENTIMENT[top.theme.tone].from}28`}
              stroke={SENTIMENT[top.theme.tone].from}
              strokeOpacity={0.7}
              strokeWidth={1}
              filter={`url(#${filterId})`}
            />
            <text
              x={10}
              y={12}
              fontSize={9}
              fill={SENTIMENT[top.theme.tone].soft}
              letterSpacing={1.4}
              fontWeight={700}
            >
              PEAK
            </text>
            <text
              x={10}
              y={24}
              fontSize={11}
              fill="#FAFAFA"
              fontWeight={700}
            >
              +{peak.value} {top.theme.name}
            </text>
          </g>
        </g>
      )}
    </>
  );
}

function LowDataMarkers({
  themes,
  days,
  W,
  H,
  PAD_X,
  PAD_BOT,
  filterId,
}: {
  themes: DashboardTheme[];
  days: number;
  W: number;
  H: number;
  PAD_X: number;
  PAD_BOT: number;
  filterId: string;
}) {
  const baselineY = H - PAD_BOT;
  const innerW = W - PAD_X * 2;
  return (
    <g>
      {themes.map((t) => {
        const g = SENTIMENT[t.tone];
        return t.sparkline
          .map((v, i) => {
            if (v <= 0) return null;
            const x = PAD_X + (i / Math.max(1, days - 1)) * innerW;
            return (
              <g key={`${t.id}-${i}`}>
                <line
                  x1={x}
                  y1={baselineY}
                  x2={x}
                  y2={baselineY - 12 - v * 4}
                  stroke={g.from}
                  strokeOpacity={0.28}
                  strokeWidth={1.5}
                />
                <circle
                  cx={x}
                  cy={baselineY - 12 - v * 4}
                  r={4}
                  fill={g.from}
                  filter={`url(#${filterId})`}
                />
                <circle
                  cx={x}
                  cy={baselineY - 12 - v * 4}
                  r={9}
                  fill={g.from}
                  opacity={0.18}
                />
              </g>
            );
          })
          .filter(Boolean);
      })}
    </g>
  );
}

// ─── Tile grid ─────────────────────────────────────────────────────

function TileGrid({
  themes,
  onTap,
}: {
  themes: DashboardTheme[];
  onTap?: (id: string) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {themes.map((t, i) => (
        <Tile key={t.id} theme={t} onTap={onTap} isTop={i === 0} />
      ))}
    </div>
  );
}

function Tile({
  theme,
  onTap,
  isTop,
}: {
  theme: DashboardTheme;
  onTap?: (id: string) => void;
  isTop: boolean;
}) {
  const g = SENTIMENT[theme.tone];
  const id = useMemo(() => Math.random().toString(36).slice(2, 9), []);
  const W = 200;
  const H = 60;
  const max = Math.max(1, ...theme.sparkline);
  const activePoints = theme.sparkline.filter((v) => v > 0).length;
  const showSparkline = activePoints >= 2;
  const { line, area } = showSparkline
    ? smoothPath(theme.sparkline, W - 8, H - 8, 4, 4, max)
    : { line: "", area: "" };

  const handle = onTap ? () => onTap(theme.id) : undefined;
  const Tag: keyof JSX.IntrinsicElements = handle ? "button" : "div";

  return (
    <Tag
      onClick={handle}
      className="group acuity-tile relative overflow-hidden rounded-2xl p-4 text-left"
      style={{
        // Layered: outer card chrome + inner sentiment-colored gradient
        // overlay (top-left → bottom-right) + top-edge highlight.
        background: `
          linear-gradient(135deg, ${g.from}26 0%, ${g.via}10 45%, rgba(20,20,30,0.7) 100%),
          linear-gradient(180deg, rgba(255,255,255,0.02) 0%, rgba(0,0,0,0.2) 100%)
        `,
        border: `1px solid ${g.from}40`,
        boxShadow: `
          inset 0 1px 0 ${g.from}40,
          inset 0 0 0 1px rgba(255,255,255,0.02),
          0 18px 50px -28px ${g.glow}
        `,
      }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -right-14 -top-14"
        style={{
          width: 110,
          height: 110,
          borderRadius: 9999,
          background: `radial-gradient(circle, ${g.from}40 0%, transparent 70%)`,
          filter: "blur(10px)",
        }}
      />
      <div className="relative">
        <div className="flex items-center gap-1.5">
          <span
            aria-hidden
            style={{
              width: 7,
              height: 7,
              borderRadius: 9999,
              background: g.from,
              boxShadow: `0 0 8px ${g.from}, 0 0 14px ${g.glow}`,
            }}
          />
          <p
            style={{
              fontSize: 9.5,
              letterSpacing: 1.6,
              fontWeight: 700,
              textTransform: "uppercase",
              color: g.soft,
            }}
          >
            {theme.trendDescription}
          </p>
        </div>
        <p
          className="mt-1 truncate"
          style={{
            fontSize: 14,
            fontWeight: 600,
            color: "rgba(244,244,245,0.95)",
            letterSpacing: -0.1,
            ...(isTop
              ? {
                  background: `linear-gradient(90deg, #FAFAFA 0%, ${g.to} 100%)`,
                  WebkitBackgroundClip: "text",
                  backgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  color: "transparent",
                }
              : {}),
          }}
        >
          {capitalize(theme.name)}
        </p>
        <div className="mt-3 flex items-end justify-between gap-2">
          <span
            style={{
              fontSize: 44,
              fontWeight: 800,
              color: "#FAFAFA",
              letterSpacing: -1.6,
              lineHeight: 0.95,
              textShadow: `0 0 20px ${g.glow}`,
              ...TABULAR,
            }}
          >
            {theme.mentionCount}
          </span>
          {showSparkline ? (
            <svg
              width={W}
              height={H}
              viewBox={`0 0 ${W} ${H}`}
              preserveAspectRatio="none"
              style={{ flex: 1, maxWidth: 110, height: 36 }}
              aria-hidden
            >
              <defs>
                <linearGradient id={`tile-stroke-${id}`} x1="0" x2="1" y1="0" y2="0">
                  <stop offset="0%" stopColor={g.from} />
                  <stop offset="100%" stopColor={g.to} />
                </linearGradient>
                <linearGradient id={`tile-fill-${id}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={g.from} stopOpacity={0.5} />
                  <stop offset="100%" stopColor={g.from} stopOpacity={0} />
                </linearGradient>
                <filter
                  id={`tile-glow-${id}`}
                  x="-20%"
                  y="-50%"
                  width="140%"
                  height="200%"
                >
                  <feGaussianBlur stdDeviation="1.4" result="b" />
                  <feMerge>
                    <feMergeNode in="b" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>
              <path d={area} fill={`url(#tile-fill-${id})`} />
              <path
                d={line}
                fill="none"
                stroke={`url(#tile-stroke-${id})`}
                strokeWidth={2.2}
                strokeLinecap="round"
                strokeLinejoin="round"
                filter={`url(#tile-glow-${id})`}
              />
            </svg>
          ) : (
            <span
              style={{
                flex: 1,
                maxWidth: 110,
                textAlign: "right",
                fontSize: 22,
                fontWeight: 600,
                color: `${g.from}99`,
                letterSpacing: 1,
              }}
              aria-label="Not enough data yet"
            >
              —
            </span>
          )}
        </div>
      </div>
    </Tag>
  );
}

// ─── Frequency spectrum ────────────────────────────────────────────

function FrequencySpectrum({ themes }: { themes: DashboardTheme[] }) {
  const max = Math.max(1, ...themes.map((t) => t.mentionCount));
  return (
    <div className="rounded-2xl p-4 sm:p-5" style={CARD_STYLE}>
      <p
        className="mb-4 uppercase"
        style={{
          fontSize: 10,
          letterSpacing: 2.4,
          fontWeight: 700,
          color: "rgba(228,228,231,0.55)",
        }}
      >
        Also mentioned
      </p>
      <div className="flex items-end gap-2 overflow-x-auto pb-2">
        {themes.map((t) => {
          const g = SENTIMENT[t.tone];
          const h = 16 + (t.mentionCount / max) * 72;
          return (
            <div
              key={t.id}
              className="flex shrink-0 flex-col items-center gap-2"
              style={{ width: 64 }}
            >
              <div
                className="relative w-full overflow-hidden rounded-t-md"
                style={{
                  height: h,
                  background: `linear-gradient(180deg, ${g.from} 0%, ${g.via} 60%, ${g.to}66 100%)`,
                  boxShadow: `0 -6px 24px -4px ${g.glow}, inset 0 1px 0 rgba(255,255,255,0.25)`,
                }}
              >
                <span
                  className="absolute left-1/2 top-1.5 -translate-x-1/2"
                  style={{
                    fontSize: 11,
                    fontWeight: 800,
                    color: "rgba(10,10,20,0.9)",
                    ...TABULAR,
                  }}
                >
                  {t.mentionCount}
                </span>
              </div>
              <div
                className="w-full truncate text-center"
                style={{
                  fontSize: 10,
                  color: "rgba(228,228,231,0.62)",
                  letterSpacing: 0.2,
                }}
                title={t.name}
              >
                {t.name}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Geometry helpers ──────────────────────────────────────────────

function smoothPath(
  values: number[],
  width: number,
  height: number,
  padX: number,
  padY: number,
  maxOverride?: number
): { line: string; area: string } {
  const n = values.length;
  if (n === 0) return { line: "", area: "" };
  const max = maxOverride ?? Math.max(1, ...values);
  const points = values.map((v, i) => {
    const x = padX + (i / Math.max(1, n - 1)) * width;
    const y = padY + height - (v / max) * height;
    return [x, y] as [number, number];
  });

  let line = `M ${points[0][0]} ${points[0][1]}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    line += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p2[0]} ${p2[1]}`;
  }

  const area =
    `${line} L ${points[points.length - 1][0]} ${padY + height} ` +
    `L ${points[0][0]} ${padY + height} Z`;

  return { line, area };
}

function findPeak(
  values: number[],
  width: number,
  height: number,
  padX: number,
  padY: number,
  maxOverride?: number
): { x: number; y: number; value: number } | null {
  if (values.length === 0) return null;
  let max = -1;
  let idx = 0;
  for (let i = 0; i < values.length; i++) {
    if (values[i] > max) {
      max = values[i];
      idx = i;
    }
  }
  if (max <= 0) return null;
  const m = maxOverride ?? Math.max(1, ...values);
  const x = padX + (idx / Math.max(1, values.length - 1)) * width;
  const y = padY + height - (max / m) * height;
  return { x, y, value: max };
}

function countActiveDays(allValues: number[], days: number): number {
  // Count distinct day-indices where ANY of the unioned series had a
  // mention. The input is a flat concat of all series' sparklines, so
  // we walk in chunks of `days`.
  if (days <= 0) return 0;
  const active = new Set<number>();
  for (let i = 0; i < allValues.length; i++) {
    if (allValues[i] > 0) active.add(i % days);
  }
  return active.size;
}

function capitalize(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}
