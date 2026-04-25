"use client";

import { useMemo } from "react";

/**
 * Theme Map dashboard composition. References: dark-navy fitness/finance
 * dashboard art with hero gradient rings, smooth wave charts with
 * gradient fills, tile grids with sparklines, and frequency spectrum
 * bars — all on one screen, layered.
 *
 * Layers (top → bottom):
 *   1. Hero ring + narrative panel   (ring + share-of-voice + sentence)
 *   2. Wave chart                    (top-3 themes overlaid, peak callout)
 *   3. Tile grid                     (themes 1-6 with mini sparkline)
 *   4. Frequency spectrum            (themes 7-15 as gradient bars)
 *
 * All graphics are raw SVG — no chart library — so the visual weight is
 * predictable and the gradient/glow vocabulary stays consistent across
 * elements. Color is sentiment-encoded via SENTIMENT (positive = warm
 * coral/peach, neutral = purple/blue, challenging = pink/rose).
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
  /** stop-1 (start) of every gradient — most saturated */
  from: string;
  /** stop-2 (mid) — softens the curve */
  via: string;
  /** stop-3 (end) — fades into the highlight */
  to: string;
  /** glow color used for outer drop-shadow auras */
  glow: string;
  /** quiet text color used for trend label / metadata */
  soft: string;
};

const SENTIMENT: Record<SentimentTone, Gradient> = {
  positive: {
    from: "#FB923C",
    via: "#FBBF24",
    to: "#FDE68A",
    glow: "rgba(251,146,60,0.42)",
    soft: "#FCD34D",
  },
  neutral: {
    from: "#A78BFA",
    via: "#60A5FA",
    to: "#22D3EE",
    glow: "rgba(96,165,250,0.42)",
    soft: "#93C5FD",
  },
  challenging: {
    from: "#F472B6",
    via: "#FB7185",
    to: "#F87171",
    glow: "rgba(244,114,182,0.42)",
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
        background: "#0A0A14",
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
    </div>
  );
}

// ─── Layer 6: Atmosphere ────────────────────────────────────────────

function Atmosphere({ tone }: { tone: SentimentTone }) {
  const g = SENTIMENT[tone];
  return (
    <>
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 left-1/2 -translate-x-1/2"
        style={{
          width: 720,
          height: 720,
          borderRadius: 9999,
          background: `radial-gradient(circle, ${g.from}28 0%, ${g.via}18 30%, transparent 65%)`,
          filter: "blur(40px)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-32 -right-24"
        style={{
          width: 380,
          height: 380,
          borderRadius: 9999,
          background: `radial-gradient(circle, ${g.to}1a 0%, transparent 70%)`,
          filter: "blur(40px)",
        }}
      />
    </>
  );
}

// ─── Layer 1: Hero ring + narrative ─────────────────────────────────

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

  // Share of voice = top theme's mentions / total mentions in window.
  // Gives a 0..1 fraction the ring stroke draws as an arc.
  const share = totalMentions > 0 ? top.mentionCount / totalMentions : 0;
  const sharePct = Math.round(share * 100);

  // Narrative ratio — "twice as often as anything else". Compare top to #2.
  const second = themes[1];
  const ratioCopy =
    second && second.mentionCount > 0
      ? top.mentionCount >= second.mentionCount * 2
        ? `${Math.round(top.mentionCount / second.mentionCount)}× more often than anything else`
        : `the leading thread you keep returning to`
      : `the only recurring thread so far`;

  return (
    <div className="relative grid grid-cols-1 gap-5 rounded-2xl border border-white/5 bg-white/[0.02] p-5 backdrop-blur-sm sm:grid-cols-[200px_1fr] sm:items-center sm:gap-6 sm:p-6">
      <HeroRing share={share} count={top.mentionCount} tone={top.tone} />
      <div className="min-w-0">
        <p
          className="uppercase"
          style={{
            fontSize: 10,
            letterSpacing: 2,
            fontWeight: 700,
            color: g.soft,
          }}
        >
          What stood out
        </p>
        <h2
          className="mt-2 text-zinc-50"
          style={{
            fontSize: 22,
            fontWeight: 700,
            letterSpacing: -0.3,
            lineHeight: 1.25,
          }}
        >
          {capitalize(top.name)} came up {top.mentionCount}{" "}
          {top.mentionCount === 1 ? "time" : "times"} {periodLabel}.
        </h2>
        <p
          className="mt-2"
          style={{
            fontSize: 14,
            lineHeight: 1.5,
            color: "rgba(228,228,231,0.78)",
          }}
        >
          {top.trendDescription === "New theme"
            ? "Brand new this period — "
            : ""}
          {ratioCopy}. {sharePct}% of every theme you mentioned.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Badge tone={top.tone}>{top.trendDescription}</Badge>
          <span
            style={{ fontSize: 12, color: "rgba(161,161,170,0.7)" }}
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
  const size = 184;
  const cx = size / 2;
  const cy = size / 2;
  const r = 72;
  const trackR = 84;
  const circumference = 2 * Math.PI * r;
  const dash = circumference * Math.max(0.04, Math.min(1, share));
  const id = useMemo(() => Math.random().toString(36).slice(2, 9), []);

  return (
    <div
      className="relative mx-auto flex items-center justify-center"
      style={{
        width: size,
        height: size,
      }}
    >
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background: `radial-gradient(circle at 50% 50%, ${g.glow} 0%, transparent 60%)`,
          filter: "blur(18px)",
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
          strokeWidth={10}
        />
        {/* progress arc */}
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke={`url(#ring-${id})`}
          strokeWidth={10}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circumference - dash}`}
          transform={`rotate(-90 ${cx} ${cy})`}
        />
        {/* tick markers around outer ring */}
        {Array.from({ length: 28 }).map((_, i) => {
          const a = (i / 28) * Math.PI * 2;
          const x1 = cx + Math.cos(a) * (trackR + 4);
          const y1 = cy + Math.sin(a) * (trackR + 4);
          const x2 = cx + Math.cos(a) * (trackR + 9);
          const y2 = cy + Math.sin(a) * (trackR + 9);
          return (
            <line
              key={i}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke="rgba(255,255,255,0.06)"
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
            fontSize: 44,
            fontWeight: 800,
            color: "#FAFAFA",
            letterSpacing: -1.5,
            lineHeight: 1,
          }}
        >
          {count}
        </span>
        <span
          style={{
            fontSize: 11,
            marginTop: 4,
            fontWeight: 600,
            letterSpacing: 1.2,
            color: g.soft,
            textTransform: "uppercase",
          }}
        >
          mentions
        </span>
      </div>
      <style jsx>{`
        @keyframes acuity-pulse {
          0%, 100% { transform: scale(0.985); }
          50% { transform: scale(1.015); }
        }
      `}</style>
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
        background: `linear-gradient(90deg, ${g.from}24 0%, ${g.to}14 100%)`,
        border: `1px solid ${g.from}40`,
        fontSize: 11,
        fontWeight: 600,
        color: g.soft,
        letterSpacing: 0.2,
      }}
    >
      <span
        aria-hidden
        style={{
          width: 6,
          height: 6,
          borderRadius: 9999,
          background: g.from,
          boxShadow: `0 0 6px ${g.glow}`,
        }}
      />
      {children}
    </span>
  );
}

// ─── Layer 2: Wave chart with gradient fills + peak callout ─────────

function WaveChart({ themes }: { themes: DashboardTheme[] }) {
  const id = useMemo(() => Math.random().toString(36).slice(2, 9), []);
  const W = 640;
  const H = 180;
  const PAD_X = 16;
  const PAD_TOP = 30;
  const PAD_BOT = 26;
  const innerW = W - PAD_X * 2;
  const innerH = H - PAD_TOP - PAD_BOT;

  // Ensure all themes share the same x-axis length so they align.
  const days = themes[0]?.sparkline.length ?? 30;
  const maxAcross = Math.max(
    1,
    ...themes.flatMap((t) => t.sparkline)
  );

  const seriesPaths = themes.map((t) => {
    const path = smoothPath(t.sparkline, innerW, innerH, PAD_X, PAD_TOP, maxAcross);
    return { theme: t, ...path };
  });

  const top = seriesPaths[0];
  const peak = top
    ? findPeak(top.theme.sparkline, innerW, innerH, PAD_X, PAD_TOP, maxAcross)
    : null;

  return (
    <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-4 sm:p-5">
      <div className="mb-3 flex items-baseline justify-between">
        <p
          className="uppercase"
          style={{
            fontSize: 10,
            letterSpacing: 2,
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
                  boxShadow: `0 0 6px ${SENTIMENT[t.tone].glow}`,
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
          style={{ display: "block", height: 180 }}
          aria-hidden
        >
          <defs>
            {seriesPaths.map((s, i) => {
              const g = SENTIMENT[s.theme.tone];
              return (
                <g key={s.theme.id}>
                  <linearGradient id={`stroke-${id}-${i}`} x1="0" x2="1" y1="0" y2="0">
                    <stop offset="0%" stopColor={g.from} />
                    <stop offset="50%" stopColor={g.via} />
                    <stop offset="100%" stopColor={g.to} />
                  </linearGradient>
                  <linearGradient id={`fill-${id}-${i}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={g.from} stopOpacity={0.22} />
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
          {/* bottom dotted lane */}
          <line
            x1={PAD_X}
            x2={W - PAD_X}
            y1={H - PAD_BOT}
            y2={H - PAD_BOT}
            stroke="rgba(255,255,255,0.08)"
            strokeWidth={1}
            strokeDasharray="2 4"
          />
          {/* fills (back to front) */}
          {seriesPaths.map((s, i) => (
            <path
              key={`fill-${s.theme.id}`}
              d={s.area}
              fill={`url(#fill-${id}-${i})`}
            />
          ))}
          {/* strokes */}
          {seriesPaths.map((s, i) => (
            <path
              key={`stroke-${s.theme.id}`}
              d={s.line}
              fill="none"
              stroke={`url(#stroke-${id}-${i})`}
              strokeWidth={i === 0 ? 2.6 : 2}
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={i === 0 ? 1 : 0.78}
            />
          ))}
          {/* peak callout */}
          {peak && top && (
            <g>
              <circle
                cx={peak.x}
                cy={peak.y}
                r={10}
                fill={SENTIMENT[top.theme.tone].from}
                opacity={0.18}
              />
              <circle
                cx={peak.x}
                cy={peak.y}
                r={5}
                fill="#0A0A14"
                stroke={SENTIMENT[top.theme.tone].from}
                strokeWidth={2}
              />
              <g transform={`translate(${Math.min(peak.x, W - 90)}, ${Math.max(peak.y - 38, 2)})`}>
                <rect
                  x={0}
                  y={0}
                  width={86}
                  height={28}
                  rx={6}
                  fill="rgba(10,10,20,0.92)"
                  stroke={SENTIMENT[top.theme.tone].from}
                  strokeOpacity={0.6}
                  strokeWidth={1}
                />
                <text
                  x={8}
                  y={11}
                  fontSize={9}
                  fill="rgba(228,228,231,0.6)"
                  letterSpacing={1}
                  fontWeight={700}
                >
                  PEAK
                </text>
                <text
                  x={8}
                  y={23}
                  fontSize={11}
                  fill="#FAFAFA"
                  fontWeight={700}
                >
                  +{peak.value} {top.theme.name}
                </text>
              </g>
            </g>
          )}
        </svg>
      </div>
    </div>
  );
}

// ─── Layer 3: Tile grid ──────────────────────────────────────────────

function TileGrid({
  themes,
  onTap,
}: {
  themes: DashboardTheme[];
  onTap?: (id: string) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {themes.map((t) => (
        <Tile key={t.id} theme={t} onTap={onTap} />
      ))}
    </div>
  );
}

function Tile({
  theme,
  onTap,
}: {
  theme: DashboardTheme;
  onTap?: (id: string) => void;
}) {
  const g = SENTIMENT[theme.tone];
  const id = useMemo(() => Math.random().toString(36).slice(2, 9), []);
  const W = 200;
  const H = 60;
  const max = Math.max(1, ...theme.sparkline);
  const { line, area } = smoothPath(theme.sparkline, W - 8, H - 8, 4, 4, max);

  const handle = onTap ? () => onTap(theme.id) : undefined;
  const Tag: keyof JSX.IntrinsicElements = handle ? "button" : "div";

  return (
    <Tag
      onClick={handle}
      className="group relative overflow-hidden rounded-2xl border p-4 text-left transition"
      style={{
        background: `linear-gradient(135deg, ${g.from}10 0%, ${g.to}06 60%, rgba(20,20,30,0.6) 100%)`,
        borderColor: `${g.from}26`,
        boxShadow: `0 12px 40px -22px ${g.glow}, inset 0 1px 0 rgba(255,255,255,0.03)`,
      }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -right-10 -top-10"
        style={{
          width: 90,
          height: 90,
          borderRadius: 9999,
          background: `radial-gradient(circle, ${g.from}22 0%, transparent 70%)`,
          filter: "blur(8px)",
        }}
      />
      <div className="relative">
        <p
          style={{
            fontSize: 11,
            letterSpacing: 1.4,
            fontWeight: 700,
            textTransform: "uppercase",
            color: g.soft,
          }}
        >
          {theme.trendDescription}
        </p>
        <p
          className="mt-1 truncate"
          style={{
            fontSize: 14,
            fontWeight: 600,
            color: "rgba(244,244,245,0.92)",
            letterSpacing: -0.1,
          }}
        >
          {capitalize(theme.name)}
        </p>
        <div className="mt-2 flex items-end justify-between gap-2">
          <span
            style={{
              fontSize: 32,
              fontWeight: 800,
              color: "#FAFAFA",
              letterSpacing: -1,
              lineHeight: 1,
            }}
          >
            {theme.mentionCount}
          </span>
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
                <stop offset="0%" stopColor={g.from} stopOpacity={0.4} />
                <stop offset="100%" stopColor={g.from} stopOpacity={0} />
              </linearGradient>
            </defs>
            <path d={area} fill={`url(#tile-fill-${id})`} />
            <path
              d={line}
              fill="none"
              stroke={`url(#tile-stroke-${id})`}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      </div>
    </Tag>
  );
}

// ─── Layer 4: Frequency spectrum ─────────────────────────────────────

function FrequencySpectrum({ themes }: { themes: DashboardTheme[] }) {
  const id = useMemo(() => Math.random().toString(36).slice(2, 9), []);
  const max = Math.max(1, ...themes.map((t) => t.mentionCount));
  return (
    <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-4 sm:p-5">
      <p
        className="mb-3 uppercase"
        style={{
          fontSize: 10,
          letterSpacing: 2,
          fontWeight: 700,
          color: "rgba(228,228,231,0.55)",
        }}
      >
        Also mentioned
      </p>
      <div className="flex items-end gap-2 overflow-x-auto pb-2">
        {themes.map((t, i) => {
          const g = SENTIMENT[t.tone];
          const h = 12 + (t.mentionCount / max) * 64;
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
                  background: `linear-gradient(180deg, ${g.from} 0%, ${g.via} 60%, ${g.to}60 100%)`,
                  boxShadow: `0 -4px 18px -2px ${g.glow}`,
                }}
              >
                <span
                  className="absolute left-1/2 top-1.5 -translate-x-1/2"
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: "rgba(10,10,20,0.85)",
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
        <div className="hidden">{id}</div>
      </div>
    </div>
  );
}

// ─── Geometry helpers ────────────────────────────────────────────────

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

  // Catmull-Rom → cubic Bezier conversion for smooth waves.
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

function capitalize(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}
