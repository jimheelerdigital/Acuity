import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { api } from "@/lib/api";

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
 * Theme Map — Round 3 visual redesign (2026-04-24). Radial / ring
 * geometry as the primary visual language: hero ring (220pt) for
 * rank 1 with share-of-all arc + centered mention count, 2×2 grid
 * of satellite ring-stat cards for ranks 2–5 (ring share relative
 * to top), and arc-row list for ranks 6+ with a 34pt frequency
 * ring on the left of each row. Replaces the editorial gallery —
 * jewel-tone gradients and soft glow retained, rectangular cards
 * out.
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

export default function ThemeMapScreen() {
  const router = useRouter();
  const [window_, setWindow] = useState<TimeWindow>("month");
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [replayToken, setReplayToken] = useState(0);

  const fetchData = useCallback(async (win: TimeWindow) => {
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

  const radialThemes: RadialTheme[] = useMemo(() => {
    if (!data) return [];
    // All themes — the radial component slices rank bands internally.
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

            <View style={{ marginBottom: 14 }}>
              <TimeChips
                value={window_}
                onChange={(next) => {
                  setWindow(next);
                  setReplayToken((t) => t + 1);
                }}
              />
            </View>

            {radialThemes.length > 0 ? (
              <ThemeRadial
                themes={radialThemes}
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
                  to see the map take shape.
                </Text>
              </View>
            )}

            <View style={{ marginTop: 6 }}>
              <SentimentLegend />
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
