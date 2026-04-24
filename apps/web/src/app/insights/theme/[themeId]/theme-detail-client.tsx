"use client";

import { useEffect, useMemo, useState } from "react";

import { formatRelativeDate } from "@acuity/shared";

import { AreaChart } from "@/components/theme-detail/AreaChart";
import { InsightCard } from "@/components/theme-detail/InsightCard";
import { MentionCard } from "@/components/theme-detail/MentionCard";
import { RelatedChips } from "@/components/theme-detail/RelatedChips";

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
  relatedThemes: Array<{
    id: string;
    name: string;
    count: number;
    sentimentBand?: SentimentBand;
  }>;
  aiInsight: string | null;
};

const SENTIMENT_COLOR: Record<SentimentBand, string> = {
  positive: "#34D399",
  challenging: "#F87171",
  neutral: "#A78BFA",
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

  const xLabels = useMemo(() => {
    if (!data) return [];
    return data.trend.length >= 4 ? ["30d ago", "20d", "10d", "Today"] : [];
  }, [data]);

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
      <header className="mb-8">
        <div className="mb-2.5 flex items-center gap-2">
          <span
            className="inline-block rounded-full"
            style={{
              width: 8,
              height: 8,
              backgroundColor: color,
              boxShadow: band === "neutral" ? "none" : `0 0 8px ${color}`,
            }}
            aria-hidden
          />
          <span
            className="uppercase"
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "1.4px",
              color: "rgba(161,161,170,0.75)",
            }}
          >
            {SENTIMENT_LABEL[band]} · {theme.mentionCount} mention
            {theme.mentionCount === 1 ? "" : "s"}
          </span>
        </div>
        <h1
          className="font-bold"
          style={{
            fontSize: 34,
            letterSpacing: "-0.8px",
            lineHeight: 1.1,
            color: "#FAFAFA",
          }}
        >
          {sentenceCase(theme.name)}
        </h1>
        <p
          className="mt-2"
          style={{ fontSize: 12, color: "rgba(161,161,170,0.7)" }}
        >
          First seen {formatRelativeDate(theme.firstMentionedAt)} · last{" "}
          {formatRelativeDate(theme.lastMentionedAt)}
        </p>
      </header>

      {theme.mentionCount > 0 && (
        <section className="mb-8">
          <h2
            className="mb-3 uppercase"
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "1.4px",
              color: "rgba(161,161,170,0.6)",
            }}
          >
            Last 30 days
          </h2>
          <AreaChart
            trend={trend}
            color={color}
            mentionCount={theme.mentionCount}
            xLabels={xLabels}
          />
        </section>
      )}

      {aiInsight && (
        <section className="mb-8">
          <InsightCard text={aiInsight} />
        </section>
      )}

      <section className="mb-8">
        <h2
          className="mb-3 uppercase"
          style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: "1.4px",
            color: "rgba(161,161,170,0.6)",
          }}
        >
          All mentions
        </h2>
        {mentions.length === 0 ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            No mentions yet.
          </p>
        ) : (
          <ul className="space-y-2.5">
            {mentions.map((m) => (
              <li key={`${m.entryId}-${m.createdAt}`}>
                <MentionCard
                  entryId={m.entryId}
                  summary={m.summary}
                  mood={m.mood}
                  createdAt={m.createdAt}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      {relatedThemes.length > 0 && (
        <section className="mb-8">
          <h2
            className="mb-3 uppercase"
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "1.4px",
              color: "rgba(161,161,170,0.6)",
            }}
          >
            Often appears alongside
          </h2>
          <RelatedChips
            items={relatedThemes.map((r) => ({
              id: r.id,
              name: r.name,
              count: r.count,
              sentiment: r.sentimentBand,
            }))}
          />
        </section>
      )}
    </>
  );
}

function sentenceCase(s: string): string {
  if (!s) return s;
  const lower = s.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}
