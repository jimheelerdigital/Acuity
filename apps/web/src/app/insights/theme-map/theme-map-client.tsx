"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { BackButton } from "@/components/back-button";
import { HeroMetricsCard } from "@/components/theme-map/HeroMetricsCard";
import { LockedState } from "@/components/theme-map/LockedState";
import { SentimentLegend } from "@/components/theme-map/SentimentLegend";
import {
  ThemeRadial,
  type RadialTheme,
} from "@/components/theme-map/ThemeRadial";
import {
  TimeChips,
  type TimeWindow,
} from "@/components/theme-map/TimeChips";

/**
 * Theme Map — Round 3 visual redesign. Radial / ring geometry:
 * hero ring card (rank 1), 2×2 satellite ring-stat cards (ranks
 * 2–5), arc rows (ranks 6+). Sentiment → gradient hue; mention
 * count → arc sweep.
 */

type SentimentBand = "positive" | "neutral" | "challenging";

type Theme = {
  id: string;
  name: string;
  mentionCount: number;
  avgSentiment: number;
  sentimentBand: SentimentBand;
  firstMentionedAt: string;
  lastMentionedAt: string;
  firstMentionedDaysAgo: number;
  sparkline: number[];
  trendDescription: string;
};

type ApiResponse = {
  themes: Theme[];
  totalMentions: number;
  topTheme: string | null;
  meta: { totalEntries: number };
};

const UNLOCK_THRESHOLD = 10;

export function ThemeMapClient() {
  const router = useRouter();
  const [window_, setWindow] = useState<TimeWindow>("month");
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [animKey, setAnimKey] = useState(0);

  const fetchData = useCallback(async (win: TimeWindow) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/insights/theme-map?window=${encodeURIComponent(win)}`,
        { cache: "no-store" }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as ApiResponse;
      setData(json);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Couldn't load your Theme Map."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData(window_);
  }, [window_, fetchData]);

  const handleWindowChange = (next: TimeWindow) => {
    setWindow(next);
    setAnimKey((k) => k + 1);
  };

  const entryCount = data?.meta.totalEntries ?? 0;
  const locked = entryCount < UNLOCK_THRESHOLD;

  const radialThemes: RadialTheme[] = useMemo(() => {
    if (!data) return [];
    return data.themes.map((t) => ({
      id: t.id,
      name: t.name,
      mentionCount: t.mentionCount,
      tone: t.sentimentBand,
    }));
  }, [data]);

  const topTheme = data?.themes[0] ?? null;

  if (loading && !data) {
    return (
      <div className="flex justify-center py-20">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-200 dark:border-white/10 border-t-violet-500" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="py-20 text-center text-sm text-zinc-500 dark:text-zinc-400">
        {error}
      </div>
    );
  }

  if (locked) {
    return (
      <>
        <Header />
        <LockedState count={entryCount} />
      </>
    );
  }

  return (
    <>
      <Header />

      {data && (
        <div className="mt-4">
          <HeroMetricsCard
            themeCount={data.themes.length}
            mentionCount={data.totalMentions}
            topTheme={data.topTheme}
            topSentiment={topTheme?.sentimentBand ?? null}
          />
        </div>
      )}

      <div className="mt-4">
        <TimeChips value={window_} onChange={handleWindowChange} />
      </div>

      {radialThemes.length > 0 ? (
        <div className="mt-4">
          <ThemeRadial
            themes={radialThemes}
            replayKey={animKey}
            onTap={(id) => router.push(`/insights/theme/${id}`)}
          />
        </div>
      ) : (
        <div className="my-10 text-center text-sm text-zinc-500 dark:text-zinc-400">
          Not enough theme variety yet — record a few more sessions to
          see the map take shape.
        </div>
      )}

      <div className="mt-4">
        <SentimentLegend />
      </div>
    </>
  );
}

function Header() {
  return (
    <div>
      <BackButton className="mb-4" ariaLabel="Back to Insights" />
      <h1
        className="text-zinc-900 dark:text-zinc-50 font-bold"
        style={{ fontSize: 34, letterSpacing: "-0.8px", lineHeight: 1.1 }}
      >
        Theme Map
      </h1>
      <p
        className="text-zinc-500 dark:text-zinc-400 mt-1"
        style={{ fontSize: 14 }}
      >
        Your recurring patterns, surfaced.
      </p>
    </div>
  );
}

export { ThemeMapClient as default };
