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
 * Per-theme card below the constellation. Header row: name + sentiment
 * dot + mention count. Body: 36-pixel-tall sparkline filled in the
 * sentiment color. Footer: "First Xd ago" | trend description.
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
      <div className="flex items-start justify-between gap-3">
        <span className="text-[15px] font-semibold text-zinc-900 dark:text-zinc-50">
          {name}
        </span>
        <span className="flex items-center gap-2.5 shrink-0">
          <span
            className="block h-2 w-2 rounded-full"
            style={{ backgroundColor: dot, boxShadow: `0 0 8px ${dotGlow}` }}
          />
          <span className="text-xs text-zinc-400 dark:text-zinc-500 tabular-nums">
            {mentionCount}
          </span>
        </span>
      </div>

      <Sparkline data={sparkline} color={fill} />

      <div className="flex items-center justify-between mt-1.5 text-[11px] text-zinc-400 dark:text-zinc-500">
        <span>First {firstMentionedDaysAgo}d ago</span>
        <span>{trendDescription}</span>
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
  if (data.length === 0) return <div style={{ height: 36 }} />;
  const w = 300;
  const h = 36;
  const max = Math.max(...data, 1);
  const stepX = data.length > 1 ? w / (data.length - 1) : w;

  const points = data.map((v, i) => ({
    x: i * stepX,
    y: h - (v / max) * (h - 4) - 2,
  }));

  const line = points.map((p) => `${p.x},${p.y}`).join(" ");
  const fillArea = `${points.map((p) => `${p.x},${p.y}`).join(" ")} ${w},${h} 0,${h}`;

  const gradId = `tm-spark-${Math.random().toString(36).slice(2, 8)}`;

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      className="block w-full mt-2"
      style={{ height: 36 }}
    >
      <defs>
        <linearGradient id={gradId} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.35} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <polyline points={fillArea} fill={`url(#${gradId})`} stroke="none" />
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
