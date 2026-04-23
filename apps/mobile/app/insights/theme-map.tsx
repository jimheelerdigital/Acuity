import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { api } from "@/lib/api";

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
 * Structure: header → time chips → summary strip → constellation
 * (static in this ship) → all-themes section with sparkline cards.
 * Gated behind 10+ entries.
 *
 * The prior implementation used a static d3-force simulation rendered
 * with react-native-svg (~400 LOC of force math + pan/zoom). It's
 * replaced wholesale per the spec; pull from git history if the force
 * graph needs to come back as an advanced view later.
 *
 * Constellation entrance animation SHIPS via Reanimated 3 (see
 * components/theme-map/Constellation.tsx) matching the web keyframes
 * one-to-one. `replayToken` bumps on time-chip change + pull-to-refresh
 * so the orbital entrance plays fresh for the new data.
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

export default function ThemeMapScreen() {
  const router = useRouter();
  const [window_, setWindow] = useState<TimeWindow>("month");
  const [sort, setSort] = useState<SortKey>("frequency");
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Bumped on time-chip change + pull-to-refresh so the Constellation
  // replays its orbital entrance animation for the freshly-fetched data.
  const [replayToken, setReplayToken] = useState(0);

  const fetchData = useCallback(async (win: TimeWindow) => {
    setLoading((prev) => prev || true);
    setError(null);
    try {
      const json = await api.get<ApiResponse>(
        `/api/insights/theme-map?window=${encodeURIComponent(win)}`
      );
      setData(json);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Couldn't load your Theme Map."
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchData(window_);
  }, [window_, fetchData]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setReplayToken((t) => t + 1);
    fetchData(window_);
  }, [fetchData, window_]);

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
    return data.themes.slice(1, 6).map((t) => ({
      id: t.id,
      name: t.name,
      tone: t.sentimentBand,
    }));
  }, [data]);

  const heroTheme = data?.themes[0] ?? null;

  if (loading && !data) {
    return (
      <SafeAreaView
        className="flex-1 bg-white dark:bg-[#0B0B12] items-center justify-center"
        edges={["top"]}
      >
        <ActivityIndicator color="#7C3AED" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      className="flex-1 bg-white dark:bg-[#0B0B12]"
      edges={["top"]}
    >
      <ScrollView
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#7C3AED"
          />
        }
        contentContainerStyle={{ paddingBottom: 40 }}
      >
        {/* Back + header */}
        <View style={{ paddingHorizontal: 20, paddingTop: 8 }}>
          <Pressable
            onPress={() => router.back()}
            hitSlop={10}
            style={{ flexDirection: "row", alignItems: "center" }}
          >
            <Ionicons name="chevron-back" size={16} color="#A1A1AA" />
            <Text
              style={{ fontSize: 15 }}
              className="text-zinc-400 dark:text-zinc-500"
            >
              Insights
            </Text>
          </Pressable>
          <Text
            style={{
              fontSize: 34,
              fontWeight: "700",
              letterSpacing: -0.8,
              lineHeight: 38,
              marginTop: 8,
            }}
            className="text-zinc-900 dark:text-zinc-50"
          >
            Theme Map
          </Text>
          <Text
            style={{ fontSize: 14, marginTop: 4 }}
            className="text-zinc-500 dark:text-zinc-400"
          >
            Your recurring patterns, surfaced.
          </Text>
        </View>

        {error && (
          <View style={{ padding: 40, alignItems: "center" }}>
            <Text className="text-zinc-500 dark:text-zinc-400">{error}</Text>
          </View>
        )}

        {!error && locked && <LockedState count={entryCount} />}

        {!error && !locked && (
          <>
            <View style={{ marginTop: 16 }}>
              <TimeChips
                value={window_}
                onChange={(next) => {
                  setWindow(next);
                  setReplayToken((t) => t + 1);
                }}
              />
            </View>

            <View style={{ marginTop: 12 }}>
              <SummaryStrip
                themeCount={data?.themes.length ?? 0}
                mentionCount={data?.totalMentions ?? 0}
                topTheme={data?.topTheme ?? null}
              />
            </View>

            {heroTheme && constellationThemes.length > 0 ? (
              <Constellation
                hero={{ id: heroTheme.id, name: heroTheme.name }}
                planets={constellationThemes}
                replayToken={replayToken}
                onTapHero={() =>
                  router.push(`/insights/theme/${heroTheme.id}` as never)
                }
                onTapPlanet={(id) =>
                  router.push(`/insights/theme/${id}` as never)
                }
              />
            ) : (
              <View
                style={{
                  marginHorizontal: 20,
                  marginVertical: 40,
                  alignItems: "center",
                }}
              >
                <Text
                  style={{ fontSize: 13, textAlign: "center" }}
                  className="text-zinc-500 dark:text-zinc-400"
                >
                  Not enough theme variety yet — record a few more sessions
                  to see the constellation take shape.
                </Text>
              </View>
            )}

            {/* All themes section */}
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                paddingHorizontal: 20,
                marginTop: 16,
                marginBottom: 8,
              }}
            >
              <Text
                style={{
                  fontSize: 12,
                  letterSpacing: 1,
                  textTransform: "uppercase",
                }}
                className="text-zinc-400 dark:text-zinc-500"
              >
                All themes
              </Text>
              <Pressable
                onPress={() => {
                  const order: SortKey[] = [
                    "frequency",
                    "alphabetical",
                    "recent",
                  ];
                  const next = order[(order.indexOf(sort) + 1) % order.length];
                  setSort(next);
                }}
              >
                <Text style={{ fontSize: 13, color: "#A78BFA" }}>
                  {SORT_LABELS[sort]} ›
                </Text>
              </Pressable>
            </View>

            {sortedThemes.slice(0, 8).map((t) => (
              <ThemeCard
                key={t.id}
                name={t.name}
                mentionCount={t.mentionCount}
                sentiment={t.sentimentBand}
                sparkline={t.sparkline}
                firstMentionedDaysAgo={t.firstMentionedDaysAgo}
                trendDescription={t.trendDescription}
                onPress={() =>
                  router.push(`/insights/theme/${t.id}` as never)
                }
              />
            ))}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
