"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { BackButton } from "@/components/back-button";
import { Constellation } from "@/components/theme-map/Constellation";
import type { ConstellationTheme } from "@/components/theme-map/Constellation";
import { LockedState } from "@/components/theme-map/LockedState";
import { SummaryStrip } from "@/components/theme-map/SummaryStrip";
import { ThemeCard } from "@/components/theme-map/ThemeCard";
import {
  TimeChips,
  type TimeWindow,
} from "@/components/theme-map/TimeChips";

/**
 * Theme Map — mobile-first redesign (2026-04-22 spec).
 *
 * Structure top-to-bottom: header → time chips → summary strip →
 * constellation → all-themes section with sparkline cards. Gated
 * behind 10+ entries; below that the user sees the LockedState.
 *
 * The prior force-directed-graph version (theme-map-client.tsx ~760
 * LOC, dynamic-imported react-force-graph) was replaced wholesale per
 * Jim's spec. If the force graph needs to come back as an advanced
 * view in a followup, pull it from git history.
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
  // Re-mounts the Constellation on window change so the entrance
  // animation replays for the new data.
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

  const constellationThemes: ConstellationTheme[] = useMemo(() => {
    if (!data || data.themes.length === 0) return [];
    // Hero = top theme. Planets = next 5.
    return data.themes.slice(1, 6).map((t, i) => {
      const size: "large" | "medium" | "small" =
        i < 2 ? "large" : i < 4 ? "medium" : "small";
      return {
        id: t.id,
        name: t.name,
        tone: t.sentimentBand,
        size,
      };
    });
  }, [data]);

  const heroTheme = data?.themes[0] ?? null;

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
      <div className="mt-4">
        <TimeChips value={window_} onChange={handleWindowChange} />
      </div>

      <div className="mt-4">
        <SummaryStrip
          themeCount={data?.themes.length ?? 0}
          mentionCount={data?.totalMentions ?? 0}
          topTheme={data?.topTheme ?? null}
        />
      </div>

      {heroTheme && constellationThemes.length > 0 ? (
        <Constellation
          key={animKey}
          hero={{ id: heroTheme.id, name: heroTheme.name }}
          planets={constellationThemes}
          onTapHero={() => router.push(`/insights/theme/${heroTheme.id}`)}
          onTapPlanet={(id) => router.push(`/insights/theme/${id}`)}
        />
      ) : (
        <div className="my-10 text-center text-sm text-zinc-500 dark:text-zinc-400">
          Not enough theme variety yet — record a few more sessions to
          see the constellation take shape.
        </div>
      )}

      <div className="mt-4 mb-2 flex items-center justify-between">
        <h2
          className="text-xs uppercase text-zinc-400 dark:text-zinc-500"
          style={{ letterSpacing: "1px" }}
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
          className="text-violet-500 hover:text-violet-400"
          style={{ fontSize: 13 }}
        >
          {SORT_LABELS[sort]} ›
        </button>
      </div>

      <div>
        {sortedThemes.slice(0, 8).map((t, i) => (
          <ThemeCard
            key={t.id}
            name={t.name}
            mentionCount={t.mentionCount}
            sentiment={t.sentimentBand}
            sparkline={t.sparkline}
            firstMentionedDaysAgo={t.firstMentionedDaysAgo}
            trendDescription={t.trendDescription}
            staggerIndex={Math.min(i, 4)}
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

// Preserve the named export the page.tsx imports.
export { ThemeMapClient as default };
