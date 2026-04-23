"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { formatRelativeDate, MOOD_LABELS } from "@acuity/shared";

type SentimentBand = "positive" | "neutral" | "challenging";

type ThemeDetail = {
  theme: {
    id: string;
    name: string;
    sentimentBand: SentimentBand;
    mentionCount: number;
    firstMentionedAt: string;
    lastMentionedAt: string;
  };
  trend: number[];
  mentions: Array<{
    entryId: string;
    summary: string | null;
    mood: string | null;
    sentiment: string;
    createdAt: string;
  }>;
  relatedThemes: Array<{ id: string; name: string; count: number }>;
  aiInsight: string | null;
};

const SENTIMENT_COLOR: Record<SentimentBand, string> = {
  positive: "#34D399",
  challenging: "#F87171",
  neutral: "#94a3b8",
};

const SENTIMENT_LABEL: Record<SentimentBand, string> = {
  positive: "Positive",
  neutral: "Neutral",
  challenging: "Challenging",
};

export function ThemeDetailClient({ themeId }: { themeId: string }) {
  const [data, setData] = useState<ThemeDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/insights/theme/${encodeURIComponent(themeId)}`,
          { cache: "no-store" }
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as ThemeDetail;
        if (!cancelled) setData(json);
      } catch (err) {
        if (!cancelled)
          setError(err instanceof Error ? err.message : "Couldn't load theme.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [themeId]);

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-200 dark:border-white/10 border-t-violet-500" />
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="py-20 text-center text-sm text-zinc-500 dark:text-zinc-400">
        {error ?? "Couldn't load theme."}
      </div>
    );
  }

  const { theme, trend, mentions, relatedThemes, aiInsight } = data;
  const band = theme.sentimentBand;
  const color = SENTIMENT_COLOR[band];

  return (
    <>
      {/* Header */}
      <header className="mb-8">
        <div className="flex items-center gap-2 mb-2">
          <span
            className="h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: color }}
            aria-hidden="true"
          />
          <span className="text-xs font-semibold uppercase tracking-widest text-zinc-500 dark:text-zinc-400">
            {SENTIMENT_LABEL[band]} · {theme.mentionCount} mention
            {theme.mentionCount === 1 ? "" : "s"}
          </span>
        </div>
        <h1 className="text-3xl font-semibold uppercase tracking-tight text-zinc-900 dark:text-zinc-50">
          {theme.name}
        </h1>
        <p className="mt-2 text-xs text-zinc-400 dark:text-zinc-500">
          First seen {formatRelativeDate(theme.firstMentionedAt)} · last{" "}
          {formatRelativeDate(theme.lastMentionedAt)}
        </p>
      </header>

      {/* Trend */}
      {theme.mentionCount > 0 && (
        <section className="mb-10">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">
            Last 30 days
          </h2>
          <TrendChart trend={trend} color={color} />
        </section>
      )}

      {/* AI insight — placeholder narrative */}
      {aiInsight && (
        <section className="mb-10 rounded-2xl border border-violet-200 dark:border-violet-900/30 bg-violet-50/40 dark:bg-violet-950/20 px-5 py-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-violet-700 dark:text-violet-300">
            What Acuity notices
          </p>
          <p className="mt-2 text-sm leading-relaxed text-zinc-700 dark:text-zinc-200">
            {aiInsight}
          </p>
        </section>
      )}

      {/* All mentions */}
      <section className="mb-10">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">
          All mentions
        </h2>
        {mentions.length === 0 ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            No mentions yet.
          </p>
        ) : (
          <ul className="space-y-2">
            {mentions.map((m) => (
              <li key={`${m.entryId}-${m.createdAt}`}>
                <Link
                  href={`/entries/${m.entryId}`}
                  className="block rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#1E1E2E] px-4 py-3 transition hover:border-violet-300 dark:hover:border-violet-700/40"
                >
                  <div className="flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400">
                    <span>{formatRelativeDate(m.createdAt)}</span>
                    {m.mood && (
                      <span>{MOOD_LABELS[m.mood] ?? m.mood}</span>
                    )}
                  </div>
                  <p className="mt-1 text-sm text-zinc-700 dark:text-zinc-200 line-clamp-2">
                    {m.summary ?? "(no summary)"}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Related themes */}
      {relatedThemes.length > 0 && (
        <section className="mb-10">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">
            Often appears alongside
          </h2>
          <div className="flex flex-wrap gap-2">
            {relatedThemes.map((r) => (
              <Link
                key={r.id}
                href={`/insights/theme/${r.id}`}
                className="rounded-full border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#1E1E2E] px-3 py-1.5 text-xs font-medium uppercase tracking-wider text-zinc-700 dark:text-zinc-200 hover:border-violet-300 dark:hover:border-violet-700/40 transition"
              >
                {r.name}
                <span className="ml-1.5 text-zinc-400 dark:text-zinc-500 lowercase tracking-normal">
                  × {r.count}
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}
    </>
  );
}

function TrendChart({ trend, color }: { trend: number[]; color: string }) {
  const total = trend.reduce((a, b) => a + b, 0);
  if (total === 0) {
    return (
      <p className="text-sm text-zinc-500 dark:text-zinc-400">
        No mentions in the last 30 days.
      </p>
    );
  }
  const nonZero = trend.filter((v) => v > 0).length;
  if (nonZero === 1) {
    const idx = trend.findIndex((v) => v > 0);
    const w = 600;
    const h = 90;
    const cx = (idx / (trend.length - 1)) * w;
    const cy = h / 2;
    return (
      <div className="rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#1E1E2E] p-4">
        <svg viewBox={`0 0 ${w} ${h}`} className="block w-full" style={{ height: 90 }}>
          <circle cx={cx} cy={cy} r={6} fill={color} />
        </svg>
      </div>
    );
  }

  const w = 600;
  const h = 90;
  const max = Math.max(...trend, 1);
  const stepX = w / (trend.length - 1);
  const points = trend.map((v, i) => ({
    x: i * stepX,
    y: h - (v / max) * (h - 8) - 4,
  }));
  const line = points.map((p) => `${p.x},${p.y}`).join(" ");

  return (
    <div className="rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#1E1E2E] p-4">
      <svg
        viewBox={`0 0 ${w} ${h}`}
        preserveAspectRatio="none"
        className="block w-full"
        style={{ height: 90 }}
      >
        <polyline
          points={line}
          fill="none"
          stroke={color}
          strokeWidth={1.8}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
}
