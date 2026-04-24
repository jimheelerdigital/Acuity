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
 * Gated behind 10+ entries.
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

  const bubbleThemes: BubbleTheme[] = useMemo(() => {
    if (!data) return [];
    // Cap at 10 so the cluster reads as a coherent grouping rather
    // than a crowded soup. Forced rank by mentionCount desc matches
    // the API's default sort.
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
      <SafeAreaView
        style={{
          flex: 1,
          backgroundColor: "#0B0B12",
          alignItems: "center",
          justifyContent: "center",
        }}
        edges={["top"]}
      >
        <ActivityIndicator color="#7C3AED" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: "#0B0B12" }}
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
        <View style={{ paddingHorizontal: 20, paddingTop: 8 }}>
          <BackButton
            onPress={() => router.back()}
            accessibilityLabel="Back to Insights"
          />
          <Text
            style={{
              fontSize: 34,
              fontWeight: "700",
              letterSpacing: -0.8,
              lineHeight: 38,
              marginTop: 16,
              color: "#FAFAFA",
            }}
          >
            Theme Map
          </Text>
          <Text
            style={{
              fontSize: 14,
              marginTop: 4,
              color: "rgba(161,161,170,0.75)",
            }}
          >
            Your recurring patterns, surfaced.
          </Text>
        </View>

        {error && (
          <View style={{ padding: 40, alignItems: "center" }}>
            <Text style={{ color: "rgba(161,161,170,0.8)" }}>{error}</Text>
          </View>
        )}

        {!error && locked && <LockedState count={entryCount} />}

        {!error && !locked && data && (
          <>
            <View style={{ marginTop: 20, marginBottom: 16 }}>
              <HeroMetricsCard
                themeCount={data.themes.length}
                mentionCount={data.totalMentions}
                topTheme={data.topTheme}
                topSentiment={topTheme?.sentimentBand ?? null}
              />
            </View>

            <View style={{ marginBottom: 8 }}>
              <TimeChips
                value={window_}
                onChange={(next) => {
                  setWindow(next);
                  setReplayToken((t) => t + 1);
                }}
              />
            </View>

            {bubbleThemes.length > 0 ? (
              <BubbleCluster
                themes={bubbleThemes}
                replayToken={replayToken}
                onTap={(id) => router.push(`/insights/theme/${id}` as never)}
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
                  style={{
                    fontSize: 13,
                    textAlign: "center",
                    color: "rgba(161,161,170,0.75)",
                  }}
                >
                  Not enough theme variety yet — record a few more sessions
                  to see the cluster take shape.
                </Text>
              </View>
            )}

            <SentimentLegend />

            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                paddingHorizontal: 20,
                marginTop: 20,
                marginBottom: 12,
              }}
            >
              <Text
                style={{
                  fontSize: 11,
                  letterSpacing: 1.2,
                  textTransform: "uppercase",
                  color: "rgba(161,161,170,0.6)",
                  fontWeight: "600",
                }}
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
                  const next =
                    order[(order.indexOf(sort) + 1) % order.length];
                  setSort(next);
                }}
              >
                <Text
                  style={{
                    fontSize: 13,
                    color: "#A78BFA",
                    fontWeight: "500",
                  }}
                >
                  {SORT_LABELS[sort]} ›
                </Text>
              </Pressable>
            </View>

            {sortedThemes.slice(0, 10).map((t) => (
              <ThemeListRow
                key={t.id}
                name={t.name}
                mentionCount={t.mentionCount}
                sentiment={t.sentimentBand}
                firstMentionedAt={t.firstMentionedAt}
                lastMentionedAt={t.lastMentionedAt}
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
