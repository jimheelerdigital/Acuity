"use client";

import { ChevronRight } from "lucide-react";
import { useId } from "react";

import { CATEGORY, MOOD, TEXT, type CategoryToken } from "./theme-tokens";

/**
 * One theme = one row. The wave LANE WIDTH scales to mention count
 * (top theme nearly fills the lane, tail themes are slivers). The
 * SHAPE of the wave is driven by per-entry mood: positive entries
 * (mood ≥ 5) curve above the baseline, negative entries (< 5) curve
 * below. Two paths (top + bottom) per row, each rendered as a glowing
 * fill + crisp stroke + tip dot at the rightmost entry.
 *
 * Path math:
 *   - Sort entries asc by timestamp.
 *   - x = (i / (n-1)) * viewBoxWidth   [center if n=1]
 *   - y = 28 - ((mood - 5) / 5) * 22, clamped [4, 52]
 *   - Top path: through positives, closed to (W,28) and (0,28).
 *   - Bottom path: through negatives, closed to (W,28) and (0,28).
 *   - Smoothing: Catmull-Rom → cubic Bezier (tension 0.5).
 */

export type WaveTheme = {
  id: string;
  name: string;
  category: CategoryToken;
  count: number;
  meanMood: number;
  lastEntryAt: string;
  trend: { priorPeriodCount: number; ratio: number | null };
  entries: { id: string; timestamp: string; mood: number }[];
  coOccurrences: { themeName: string; count: number }[];
};

const VB_W = 800;
const VB_H = 56;
const BASELINE_Y = 28;

export function ThemeMoodWaveRow({
  rank,
  theme,
  maxCountInPeriod,
  isFirst,
  onTap,
}: {
  rank: number;
  theme: WaveTheme;
  maxCountInPeriod: number;
  isFirst: boolean;
  onTap?: (id: string) => void;
}) {
  const c = CATEGORY[theme.category];
  const widthPct = Math.max(
    6,
    Math.min(100, (theme.count / Math.max(1, maxCountInPeriod)) * 100)
  );
  const isFaded = isFadedTheme(theme.lastEntryAt);
  const trendCaption = pickTrendCaption(theme);
  const moodColor = colorForMean(theme.meanMood);

  return (
    <button
      type="button"
      onClick={onTap ? () => onTap(theme.id) : undefined}
      className="group grid w-full items-center px-6 py-3.5 text-left transition hover:bg-white/[0.02]"
      style={{
        gridTemplateColumns: "28px 130px 1fr 70px 22px",
        gap: 12,
        borderTop: isFirst ? "none" : "0.5px solid rgba(255,255,255,0.04)",
        cursor: "pointer",
      }}
    >
      <span
        style={{
          fontSize: 11,
          fontWeight: 600,
          color: "rgba(168,168,180,0.4)",
          letterSpacing: 1,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {String(rank).padStart(2, "0")}
      </span>

      <div className="min-w-0">
        <div
          className="truncate"
          style={{
            fontSize: 14,
            fontWeight: 500,
            color: TEXT.primary,
            letterSpacing: -0.1,
          }}
        >
          {capitalize(theme.name)}
        </div>
        <div
          className="mt-0.5 truncate"
          style={{
            fontSize: 11,
            color: trendCaption.color,
          }}
        >
          {trendCaption.text}
        </div>
      </div>

      <div className="relative" style={{ height: VB_H }}>
        <div
          aria-hidden
          style={{
            position: "absolute",
            top: BASELINE_Y,
            left: 0,
            right: 0,
            height: 0.5,
            background: "rgba(255,255,255,0.06)",
          }}
        />
        <div
          style={{
            width: `${widthPct}%`,
            height: "100%",
            opacity: isFaded ? 0.5 : 1,
          }}
        >
          <WaveSVG entries={theme.entries} category={theme.category} hideTip={isFaded} />
        </div>
      </div>

      <div
        className="text-right"
        style={{ fontVariantNumeric: "tabular-nums" }}
      >
        <div
          style={{
            fontSize: 18,
            fontWeight: 500,
            color: TEXT.primary,
            lineHeight: 1,
            textShadow: `0 0 12px ${c.solid}55`,
          }}
        >
          {theme.count}
        </div>
        <div
          style={{
            fontSize: 10,
            color: moodColor,
            marginTop: 4,
          }}
        >
          mood {theme.meanMood.toFixed(1)}
        </div>
      </div>

      <ChevronRight
        size={16}
        className="text-zinc-500 transition group-hover:text-zinc-300"
        aria-hidden
      />
    </button>
  );
}

function WaveSVG({
  entries,
  category,
  hideTip,
}: {
  entries: WaveTheme["entries"];
  category: CategoryToken;
  hideTip: boolean;
}) {
  const c = CATEGORY[category];
  const id = useId().replace(/:/g, "");
  const points = entries.map((e, i) => {
    const x =
      entries.length === 1 ? VB_W / 2 : (i / (entries.length - 1)) * VB_W;
    const y = Math.max(4, Math.min(52, 28 - ((e.mood - 5) / 5) * 22));
    return { x, y, mood: e.mood };
  });

  if (points.length === 0) {
    return (
      <svg
        width="100%"
        height={VB_H}
        viewBox={`0 0 ${VB_W} ${VB_H}`}
        preserveAspectRatio="none"
      >
        <line
          x1={0}
          y1={BASELINE_Y}
          x2={VB_W}
          y2={BASELINE_Y}
          stroke={c.solid}
          strokeOpacity={0.35}
          strokeWidth={1}
        />
      </svg>
    );
  }

  const positive = points.filter((p) => p.mood >= 5);
  const negative = points.filter((p) => p.mood < 5);

  const positivePath = buildHalfPath(positive, VB_W, "top");
  const negativePath = buildHalfPath(negative, VB_W, "bottom");

  // Tip dot at the rightmost entry.
  const lastPoint = points[points.length - 1];

  return (
    <svg
      width="100%"
      height={VB_H}
      viewBox={`0 0 ${VB_W} ${VB_H}`}
      preserveAspectRatio="none"
    >
      <defs>
        <linearGradient id={`top-fill-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={MOOD.positive} stopOpacity={0.6} />
          <stop offset="100%" stopColor={c.solid} stopOpacity={0.1} />
        </linearGradient>
        <linearGradient id={`top-stroke-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={MOOD.positiveLight} />
          <stop offset="100%" stopColor={c.solid} />
        </linearGradient>
        <linearGradient id={`bot-fill-${id}`} x1="0" y1="1" x2="0" y2="0">
          <stop offset="0%" stopColor={MOOD.negative} stopOpacity={0.6} />
          <stop offset="100%" stopColor={c.solid} stopOpacity={0.1} />
        </linearGradient>
        <linearGradient id={`bot-stroke-${id}`} x1="0" y1="1" x2="0" y2="0">
          <stop offset="0%" stopColor={MOOD.negativeLight} />
          <stop offset="100%" stopColor={c.solid} />
        </linearGradient>
        <filter id={`glow-${id}`} x="-10%" y="-50%" width="120%" height="200%">
          <feGaussianBlur stdDeviation="3" />
        </filter>
      </defs>

      {/* baseline mood line */}
      <line
        x1={0}
        y1={BASELINE_Y}
        x2={VB_W}
        y2={BASELINE_Y}
        stroke="rgba(255,255,255,0.06)"
        strokeWidth={0.5}
      />

      {positivePath && (
        <>
          <path
            d={positivePath.area}
            fill={`url(#top-fill-${id})`}
            opacity={0.6}
            filter={`url(#glow-${id})`}
          />
          <path d={positivePath.area} fill={`url(#top-fill-${id})`} />
          <path
            d={positivePath.line}
            fill="none"
            stroke={`url(#top-stroke-${id})`}
            strokeWidth={1.6}
            strokeLinecap="round"
            opacity={0.7}
            filter={`url(#glow-${id})`}
          />
          <path
            d={positivePath.line}
            fill="none"
            stroke={`url(#top-stroke-${id})`}
            strokeWidth={1.4}
            strokeLinecap="round"
          />
        </>
      )}
      {negativePath && (
        <>
          <path
            d={negativePath.area}
            fill={`url(#bot-fill-${id})`}
            opacity={0.6}
            filter={`url(#glow-${id})`}
          />
          <path d={negativePath.area} fill={`url(#bot-fill-${id})`} />
          <path
            d={negativePath.line}
            fill="none"
            stroke={`url(#bot-stroke-${id})`}
            strokeWidth={1.6}
            strokeLinecap="round"
            opacity={0.7}
            filter={`url(#glow-${id})`}
          />
          <path
            d={negativePath.line}
            fill="none"
            stroke={`url(#bot-stroke-${id})`}
            strokeWidth={1.4}
            strokeLinecap="round"
          />
        </>
      )}

      {!hideTip && (
        <>
          <circle
            cx={lastPoint.x}
            cy={lastPoint.y}
            r={5}
            fill={lastPoint.mood >= 5 ? MOOD.positive : MOOD.negative}
            opacity={0.3}
          />
          <circle
            cx={lastPoint.x}
            cy={lastPoint.y}
            r={2.5}
            fill={lastPoint.mood >= 5 ? MOOD.positiveLight : MOOD.negativeLight}
          />
        </>
      )}
    </svg>
  );
}

/**
 * Build a smooth half-shape path through a set of points, closed to
 * the baseline so it can be filled. Catmull-Rom → cubic Bezier with
 * tension 0.5.
 */
function buildHalfPath(
  pts: { x: number; y: number; mood: number }[],
  width: number,
  half: "top" | "bottom"
): { line: string; area: string } | null {
  if (pts.length === 0) return null;

  // Always anchor the endpoints at the baseline so the closed area
  // doesn't draw a vertical drop at the left/right edges.
  const anchored = [
    { x: 0, y: BASELINE_Y },
    ...pts,
    { x: width, y: BASELINE_Y },
  ];

  let line = `M ${anchored[0].x} ${anchored[0].y}`;
  for (let i = 0; i < anchored.length - 1; i++) {
    const p0 = anchored[Math.max(0, i - 1)];
    const p1 = anchored[i];
    const p2 = anchored[i + 1];
    const p3 = anchored[Math.min(anchored.length - 1, i + 2)];
    const t = 0.5;
    const c1x = p1.x + ((p2.x - p0.x) / 6) * t * 2;
    const c1y = p1.y + ((p2.y - p0.y) / 6) * t * 2;
    const c2x = p2.x - ((p3.x - p1.x) / 6) * t * 2;
    const c2y = p2.y - ((p3.y - p1.y) / 6) * t * 2;
    line += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p2.x} ${p2.y}`;
  }
  // Area: line + close along baseline
  const area = `${line} L ${width} ${BASELINE_Y} L 0 ${BASELINE_Y} Z`;
  return { line, area };

  // `half` is unused here — the points already encode their side via
  // y position; baseline-closing handles fill. Kept in signature for
  // call-site clarity.
  void half;
}

function isFadedTheme(lastEntryAt: string): boolean {
  const days = (Date.now() - new Date(lastEntryAt).getTime()) / 86_400_000;
  return days > 14;
}

function pickTrendCaption(theme: WaveTheme): { text: string; color: string } {
  // Priority: faded > co-occurrence > extreme mood > trend > default.
  if (isFadedTheme(theme.lastEntryAt)) {
    const date = new Date(theme.lastEntryAt).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
    return {
      text: `↓ fading · last seen ${date}`,
      color: "rgba(168,168,180,0.55)",
    };
  }

  // Co-occurrence > 50% of mentions
  const topCo = theme.coOccurrences[0];
  if (topCo && topCo.count > theme.count * 0.5) {
    return {
      text: `paired with ${topCo.themeName}`,
      color: "rgba(168,168,180,0.55)",
    };
  }

  // Extreme mood
  if (theme.entries.length >= 3) {
    if (theme.meanMood > 7.5) {
      return {
        text: "consistently positive · highest mood",
        color: "#34D399",
      };
    }
    if (theme.meanMood < 5) {
      const negCount = theme.entries.filter((e) => e.mood < 5).length;
      return {
        text: `consistently low mood · ${negCount} of ${theme.entries.length} negative`,
        color: "#FB7185",
      };
    }
  }

  // Trend up
  if (
    theme.trend.ratio !== null &&
    theme.trend.ratio >= 1.5 &&
    theme.trend.priorPeriodCount > 0
  ) {
    return {
      text: `↑ ${Math.round(theme.trend.ratio)}× this week vs last`,
      color: "#FCA85A",
    };
  }

  // Default
  return {
    text: "balanced · reflective tone",
    color: "rgba(168,168,180,0.55)",
  };
}

function colorForMean(mean: number): string {
  if (mean < 5) return "#FB7185";
  if (mean > 7.5) return "#34D399";
  return "rgba(168,168,180,0.6)";
}

function capitalize(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}
