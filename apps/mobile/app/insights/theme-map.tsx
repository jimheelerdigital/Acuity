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
import { isFreeTierUser } from "@/lib/free-tier";

import { StickyBackButton } from "@/components/back-button";
import { ProLockedCard } from "@/components/pro-locked-card";
import { LockedState } from "@/components/theme-map/LockedState";
import { useAuth } from "@/contexts/auth-context";
import { useTheme } from "@/contexts/theme-context";
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

export default function ThemeMapScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { tokens } = useTheme();
  const isProLocked = isFreeTierUser(user);
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
      <SafeAreaView
        style={{
          flex: 1,
          backgroundColor: tokens.bg,
          alignItems: "center",
          justifyContent: "center",
        }}
        edges={["top"]}
      >
        <ActivityIndicator color={tokens.primary} />
      </SafeAreaView>
    );
  }

  // Q11d-4: token sweep on the existing list/dashboard Theme Map.
  // Structural orbital cosmos rebuild (9 planets, 4 ring guides, 70
  // stars, 6.0s entrance) is Q11 Phase E — separate slice. This
  // commit only changes color tokens on the current dashboard.
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: tokens.bg }} edges={["top"]}>
      <StickyBackButton onPress={() => router.back()} accessibilityLabel="Back to Insights" />
      <ScrollView
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={tokens.primary}
          />
        }
        contentContainerStyle={{ paddingBottom: 40, paddingTop: 56 }}
      >
        <View style={{ paddingHorizontal: 20 }}>
          <Text
            style={{
              fontSize: 12,
              letterSpacing: 2.8,
              fontWeight: "700",
              color: tokens.primary,
              textTransform: "uppercase",
              marginBottom: 10,
            }}
          >
            Reflect · Theme Map
          </Text>
          <Text
            style={{
              fontSize: 32,
              fontWeight: "500",
              letterSpacing: -0.4,
              lineHeight: 36,
              color: tokens.text,
              marginBottom: 8,
            }}
          >
            Theme Map
          </Text>
          <Text
            style={{
              fontSize: 18,
              color: tokens.textSec,
            }}
          >
            Your recurring patterns, surfaced.
          </Text>
        </View>

        {error && (
          <View style={{ padding: 40, alignItems: "center" }}>
            <Text style={{ color: tokens.textSec }}>{error}</Text>
          </View>
        )}

        {!error && isProLocked && (
          <View style={{ marginTop: 16 }}>
            <ProLockedCard surfaceId="theme_map_locked" />
          </View>
        )}

        {!error && !isProLocked && locked && (
          <LockedState count={entryCount} />
        )}

        {!error && !locked && data && (
          <>
            <View style={{ marginTop: 14, marginBottom: 6 }}>
              <TimeChips value={window_} onChange={setWindow} />
            </View>

            {dashboardThemes.length > 0 ? (
              <ThemeMapDashboard
                themes={dashboardThemes}
                totalMentions={data.totalMentions ?? 0}
                topThemeName={data.topThemeName ?? data.topTheme}
                periods={data.periods}
                timeWindow={window_}
                windowStart={data.meta.windowStart}
                windowEnd={data.meta.windowEnd}
              />
            ) : (
              <View style={{ marginHorizontal: 20, marginVertical: 40, alignItems: "center" }}>
                <Text
                  style={{
                    fontSize: 13,
                    textAlign: "center",
                    color: tokens.textSec,
                  }}
                >
                  Not enough theme variety yet — record a few more sessions to see your patterns surface.
                </Text>
              </View>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
