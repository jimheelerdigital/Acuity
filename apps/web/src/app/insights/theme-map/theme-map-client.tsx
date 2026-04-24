"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { BackButton } from "@/components/back-button";
import {
  BubbleCluster,
  type BubbleTheme,
} from "@/components/theme-map/BubbleCluster";
import { HeroMetricsCard } from "@/components/theme-map/HeroMetricsCard";
import { LockedState } from "@/components/theme-map/LockedState";
import { SentimentLegend } from "@/components/theme-map/SentimentLegend";
import { ThemeListRow } from "@/components/theme-map/ThemeListRow";
import {
  TimeChips,
  type TimeWindow,
} from "@/components/theme-map/TimeChips";

/**
 * Theme Map — Run B visual redesign (2026-04-24 spec). Bubble cluster
 * replaces the orb constellation, hero metrics card replaces the
 * three-stat strip, sparklines are gone from the All Themes list.
 * Gated behind 10+ entries; below that the user sees LockedState.
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

type SortKey = "frequency" | "alphabetical" | "recent";

const SORT_LABELS: Record<SortKey, string> = {
  frequency: "Sort by frequency",
  alphabetical: "Sort alphabetically",
  recent: "Sort by recent",
};

export function ThemeMapClient() {
  const router = useRouter();
  const [window_, setWindow] = useState<TimeWindow>("month");
  const [sort, setSort] = useState<SortKey>("frequency");
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

  const sortedThemes = useMemo(() => {
    if (!data) return [];
    const arr = [...data.themes];
    if (sort === "alphabetical") {
      arr.sort((a, b) => a.name.localeCompare(b.name));
    } else if (sort === "recent") {
      arr.sort(
        (a, b) =>
          new Date(b.lastMentionedAt).getTime() -
          new Date(a.lastMentionedAt).getTime()
      );
    }
    return arr;
  }, [data, sort]);

  const bubbleThemes: BubbleTheme[] = useMemo(() => {
    if (!data) return [];
    return data.themes.slice(0, 10).map((t) => ({
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

      {bubbleThemes.length > 0 ? (
        <BubbleCluster
          themes={bubbleThemes}
          replayKey={animKey}
          onTap={(id) => router.push(`/insights/theme/${id}`)}
        />
      ) : (
        <div className="my-10 text-center text-sm text-zinc-500 dark:text-zinc-400">
          Not enough theme variety yet — record a few more sessions to
          see the cluster take shape.
        </div>
      )}

      <SentimentLegend />

      <div className="mt-5 mb-3 flex items-center justify-between">
        <h2
          className="uppercase"
          style={{
            fontSize: 11,
            letterSpacing: "1.2px",
            color: "rgba(161,161,170,0.6)",
            fontWeight: 600,
          }}
        >
          All themes
        </h2>
        <button
          type="button"
          onClick={() => {
            const order: SortKey[] = ["frequency", "alphabetical", "recent"];
            const next = order[(order.indexOf(sort) + 1) % order.length];
            setSort(next);
          }}
          className="text-violet-400 hover:text-violet-300"
          style={{ fontSize: 13, fontWeight: 500 }}
        >
          {SORT_LABELS[sort]} ›
        </button>
      </div>

      <div>
        {sortedThemes.slice(0, 10).map((t) => (
          <ThemeListRow
            key={t.id}
            name={t.name}
            mentionCount={t.mentionCount}
            sentiment={t.sentimentBand}
            firstMentionedAt={t.firstMentionedAt}
            lastMentionedAt={t.lastMentionedAt}
            onClick={() => router.push(`/insights/theme/${t.id}`)}
          />
        ))}
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
