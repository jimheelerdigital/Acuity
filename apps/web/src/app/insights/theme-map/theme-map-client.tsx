"use client";

import { useRouter } from "next/navigation";
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

/**
 * Theme Map — dashboard composition. Hero ring + share-of-voice
 * narrative, gradient-stroked wave chart with peak callout, tile grid
 * with sparklines per theme, and a frequency spectrum bar chart for
 * the long tail. See ThemeMapDashboard.tsx for the per-layer rationale.
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
  };

  const entryCount = data?.meta.totalEntries ?? 0;
  const locked = entryCount < UNLOCK_THRESHOLD;

  const dashboardThemes: DashboardTheme[] = useMemo(() => {
    if (!data) return [];
    return data.themes.map((t) => ({
      id: t.id,
      name: t.name,
      mentionCount: t.mentionCount,
      tone: t.sentimentBand,
      sparkline: t.sparkline,
      trendDescription: t.trendDescription,
      firstMentionedDaysAgo: t.firstMentionedDaysAgo,
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
        <TimeChips value={window_} onChange={handleWindowChange} />
      </div>

      {dashboardThemes.length > 0 ? (
        <div className="mt-5">
          <ThemeMapDashboard
            themes={dashboardThemes}
            totalMentions={data?.totalMentions ?? 0}
            timeWindow={window_}
            onTap={(id) => router.push(`/insights/theme/${id}`)}
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
    <div>
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
