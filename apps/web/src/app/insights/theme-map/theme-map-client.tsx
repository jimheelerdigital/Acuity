"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { StickyBackButton } from "@/components/back-button";
import { LockedState } from "@/components/theme-map/LockedState";
import {
  ThemeMapDashboard,
  type DashboardTheme,
} from "@/components/theme-map/ThemeMapDashboard";
import {
  TimeChips,
  type TimeWindow,
} from "@/components/theme-map/TimeChips";

type CategoryToken = "activity" | "reflection" | "life" | "emotional";
type SentimentBand = "positive" | "neutral" | "challenging";

type ApiTheme = {
  id: string;
  name: string;
  category: CategoryToken;
  mentionCount: number;
  meanMood: number;
  avgSentiment: number;
  sentimentBand: SentimentBand;
  firstMentionedAt: string;
  lastMentionedAt: string;
  lastEntryAt: string;
  firstMentionedDaysAgo: number;
  sparkline: number[];
  trendDescription: string;
  trend: { priorPeriodCount: number; ratio: number | null };
  entries: { id: string; timestamp: string; mood: number }[];
  coOccurrences: { themeName: string; count: number }[];
  recentEntries: {
    id: string;
    createdAt: string;
    sentiment: "POSITIVE" | "NEGATIVE" | "NEUTRAL";
    excerpt: string;
  }[];
};

type ApiResponse = {
  themes: ApiTheme[];
  totalMentions: number;
  topTheme: string | null;
  topThemeName: string | null;
  periodLabel: string;
  periods: {
    today: { count: number; mood: number };
    week: { count: number; mood: number };
    month: { count: number; mood: number };
  };
  meta: {
    totalEntries: number;
    windowStart: string | null;
    windowEnd: string;
  };
};

const UNLOCK_THRESHOLD = 10;

export function ThemeMapClient() {
  const [window_, setWindow] = useState<TimeWindow>("month");
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  const entryCount = data?.meta.totalEntries ?? 0;
  const locked = entryCount < UNLOCK_THRESHOLD;

  const dashboardThemes: DashboardTheme[] = useMemo(() => {
    if (!data) return [];
    return data.themes.map((t) => ({
      id: t.id,
      name: t.name,
      category: t.category,
      count: t.mentionCount,
      meanMood: t.meanMood,
      lastEntryAt: t.lastEntryAt,
      trend: t.trend,
      entries: t.entries,
      coOccurrences: t.coOccurrences,
      sentimentBand: t.sentimentBand,
      sparkline: t.sparkline,
      trendDescription: t.trendDescription,
      firstMentionedDaysAgo: t.firstMentionedDaysAgo,
      recentEntries: t.recentEntries,
    }));
  }, [data]);

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
        <StickyBackButton />
        <Header />
        <LockedState count={entryCount} />
      </>
    );
  }

  return (
    <>
      <StickyBackButton />
      <Header />

      <div className="mt-4">
        <TimeChips value={window_} onChange={setWindow} />
      </div>

      {dashboardThemes.length > 0 && data ? (
        <div className="mt-5">
          <ThemeMapDashboard
            themes={dashboardThemes}
            totalMentions={data.totalMentions ?? 0}
            topThemeName={data.topThemeName ?? data.topTheme}
            periods={data.periods}
            timeWindow={window_}
            windowStart={data.meta.windowStart}
            windowEnd={data.meta.windowEnd}
          />
        </div>
      ) : (
        <div className="my-10 text-center text-sm text-zinc-500 dark:text-zinc-400">
          Not enough theme variety yet — record a few more sessions to
          see your patterns surface.
        </div>
      )}
    </>
  );
}

function Header() {
  return (
    <div style={{ marginBottom: 36 }}>
      <p
        style={{
          fontSize: 12,
          letterSpacing: 2.8,
          fontWeight: 700,
          color: "#FCA85A",
          textTransform: "uppercase",
          marginBottom: 10,
        }}
      >
        Reflect · Theme Map
      </p>
      <h1
        className="text-zinc-900 dark:text-zinc-50"
        style={{
          fontSize: 32,
          fontWeight: 500,
          letterSpacing: "-0.4px",
          lineHeight: 1.15,
          marginBottom: 8,
        }}
      >
        Theme Map
      </h1>
      <p
        style={{
          fontSize: 18,
          color: "rgba(168,168,180,0.75)",
        }}
      >
        Your recurring patterns, surfaced.
      </p>
    </div>
  );
}

export { ThemeMapClient as default };
