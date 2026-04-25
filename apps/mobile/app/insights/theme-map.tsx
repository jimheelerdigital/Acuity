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
 * Theme Map (mobile) — dashboard composition with hero ring + share-of-
 * voice narrative, gradient wave chart with peak callout, sparkline tile
 * grid, and a frequency spectrum bar chart for the long tail. See
 * components/theme-map/ThemeMapDashboard.tsx for per-layer rationale.
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
    fetchData(window_);
  }, [fetchData, window_]);

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
      <StickyBackButton
        onPress={() => router.back()}
        accessibilityLabel="Back to Insights"
      />
      <ScrollView
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#7C3AED"
          />
        }
        contentContainerStyle={{ paddingBottom: 40, paddingTop: 56 }}
      >
        <View style={{ paddingHorizontal: 20 }}>
          <Text
            style={{
              fontSize: 34,
              fontWeight: "700",
              letterSpacing: -0.8,
              lineHeight: 38,
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
            <View style={{ marginTop: 14, marginBottom: 6 }}>
              <TimeChips
                value={window_}
                onChange={(next) => setWindow(next)}
              />
            </View>

            {dashboardThemes.length > 0 ? (
              <ThemeMapDashboard
                themes={dashboardThemes}
                totalMentions={data.totalMentions ?? 0}
                timeWindow={window_}
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
                  Not enough theme variety yet — record a few more
                  sessions to see your patterns surface.
                </Text>
              </View>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
