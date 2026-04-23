"use client";

type Sentiment = "positive" | "neutral" | "challenging";

const SENTIMENT_HEX: Record<Sentiment, string> = {
  positive: "#34D399",
  challenging: "#F87171",
  neutral: "#7C3AED",
};

const SENTIMENT_DOT: Record<Sentiment, string> = {
  positive: "#34D399",
  challenging: "#F87171",
  neutral: "#94a3b8",
};

const SENTIMENT_GLOW: Record<Sentiment, string> = {
  positive: "rgba(52,211,153,0.6)",
  challenging: "rgba(248,113,113,0.6)",
  neutral: "transparent",
};

/**
 * Row in the "All themes" list below the constellation. Two-column
 * layout: theme name + metadata on the left, a compact 7-day
 * sparkline constrained to ~30% of row width on the right. The old
 * full-width sparkline overflowed the screen edge on narrow
 * viewports; capping its max-width + right-aligning fixes the cutoff.
 *
 * Entrance is a 0.5s fadeInUp; stagger delays come from the parent
 * (setting `animationDelay` on the outer wrapper per index).
 */
export function ThemeCard({
  name,
  mentionCount,
  sentiment,
  sparkline,
  firstMentionedDaysAgo,
  trendDescription,
  onClick,
  staggerIndex,
}: {
  name: string;
  mentionCount: number;
  sentiment: Sentiment;
  sparkline: number[];
  firstMentionedDaysAgo: number;
  trendDescription: string;
  onClick?: () => void;
  staggerIndex: number; // 0..4
}) {
  const delay = 7.1 + staggerIndex * 0.15; // 7.1 / 7.25 / 7.4 / 7.55 / 7.7
  const fill = SENTIMENT_HEX[sentiment];
  const dot = SENTIMENT_DOT[sentiment];
  const dotGlow = SENTIMENT_GLOW[sentiment];

  // Last 7 days of the sparkline only — keeps the narrow column
  // legible.
  const trimmed = sparkline.slice(-7);

  return (
    <button
      type="button"
      onClick={onClick}
      className="tm-card block w-full text-left rounded-[14px] border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#1E1E2E] px-4 py-3.5 mb-2 transition hover:-translate-y-px hover:border-violet-500/50"
      style={{
        opacity: 0,
        animation: `tmCardIn 0.5s ease-out ${delay}s forwards`,
      }}
    >
      <div className="flex items-center justify-between gap-4">
        {/* Left column — name + metadata */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span
              className="block h-2 w-2 rounded-full shrink-0"
              style={{ backgroundColor: dot, boxShadow: `0 0 8px ${dotGlow}` }}
            />
            <span className="text-[15px] font-semibold uppercase tracking-wide text-zinc-900 dark:text-zinc-50 truncate">
              {name}
            </span>
            <span className="text-xs text-zinc-400 dark:text-zinc-500 tabular-nums shrink-0">
              {mentionCount}
            </span>
          </div>
          <div className="mt-1 flex items-center gap-2 text-[11px] text-zinc-400 dark:text-zinc-500">
            <span>First {firstMentionedDaysAgo}d ago</span>
            <span aria-hidden>·</span>
            <span className="truncate">{trendDescription}</span>
          </div>
        </div>

        {/* Right column — compact 7d sparkline. Max-width cap keeps
            it from eating row space on narrow viewports. */}
        <div
          className="shrink-0"
          style={{ width: "30%", maxWidth: 140, minWidth: 64 }}
        >
          <Sparkline data={trimmed} color={fill} />
        </div>
      </div>

      <style jsx>{`
        @keyframes tmCardIn {
          from {
            opacity: 0;
            transform: translateY(6px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .tm-card {
            opacity: 1 !important;
            animation: none !important;
          }
        }
      `}</style>
    </button>
  );
}

function Sparkline({ data, color }: { data: number[]; color: string }) {
  const h = 28;
  if (data.length === 0) return <div style={{ height: h }} />;
  // Single data point → dot. The old full-width polyline degraded
  // into a flat invisible line at length 1.
  if (data.length === 1) {
    const w = 80;
    return (
      <svg
        viewBox={`0 0 ${w} ${h}`}
        preserveAspectRatio="none"
        className="block w-full"
        style={{ height: h }}
      >
        <circle cx={w / 2} cy={h / 2} r={3} fill={color} />
      </svg>
    );
  }

  const w = 80;
  const max = Math.max(...data, 1);
  const stepX = w / (data.length - 1);
  const points = data.map((v, i) => ({
    x: i * stepX,
    y: h - (v / max) * (h - 4) - 2,
  }));
  const line = points.map((p) => `${p.x},${p.y}`).join(" ");

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      className="block w-full"
      style={{ height: h }}
    >
      <polyline
        points={line}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}
