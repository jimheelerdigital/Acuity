import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { MOOD_EMOJI, DEFAULT_LIFE_AREAS, type EntryDTO } from "@acuity/shared";

import { ComparisonsCard } from "@/components/comparisons-card";
import { LifeMapRadar } from "@/components/life-map-radar";
import { UserInsightsCard } from "@/components/user-insights-card";
import { useTheme } from "@/contexts/theme-context";
import { api } from "@/lib/api";

type Report = {
  id: string;
  weekStart: string;
  weekEnd: string;
  narrative: string | null;
  insightBullets: string[];
  moodArc: string | null;
  topThemes: string[];
  tasksOpened: number;
  tasksClosed: number;
  entryCount: number;
  status: string;
};

type LifeMapAreaData = {
  id: string;
  area: string;
  name: string | null;
  color: string | null;
  score: number;
  trend: string | null;
  weeklyDelta: number | null;
  mentionCount: number;
  insightSummary: string | null;
  topThemes: string[];
  baselineScore: number;
};

type MemoryData = {
  totalEntries: number;
  firstEntryDate: string | null;
  recurringThemes: any[];
  recurringPeople: any[];
  recurringGoals: any[];
};

const MOOD_COLORS: Record<string, string> = {
  GREAT: "#22C55E",
  GOOD: "#86EFAC",
  NEUTRAL: "#71717A",
  LOW: "#FBBF24",
  ROUGH: "#EF4444",
};

export default function InsightsTab() {
  const router = useRouter();
  const { resolved: resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const [entries, setEntries] = useState<EntryDTO[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [areas, setAreas] = useState<LifeMapAreaData[]>([]);
  const [memory, setMemory] = useState<MemoryData | null>(null);
  const [expandedArea, setExpandedArea] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [view, setView] = useState<"current" | "trend">("current");
  const [trend, setTrend] = useState<{
    hasEnoughHistory: boolean;
    fourWeeksAgo: Array<{ area: string; score: number | null }>;
  } | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const [entriesRes, reportsRes, lifeMapRes, trendRes] = await Promise.all([
        api.get<{ entries: EntryDTO[] }>("/api/entries"),
        api.get<{ reports: Report[] }>("/api/weekly"),
        api.get<{ areas: LifeMapAreaData[]; memory: MemoryData }>("/api/lifemap"),
        api
          .get<{
            hasEnoughHistory: boolean;
            fourWeeksAgo: Array<{ area: string; score: number | null }>;
          }>("/api/lifemap/trend")
          .catch(() => null),
      ]);
      setEntries(entriesRes.entries?.slice(0, 7) ?? []);
      setReports(reportsRes.reports ?? []);
      setAreas(lifeMapRes.areas ?? []);
      setMemory(lifeMapRes.memory ?? null);
      setTrend(trendRes);
    } catch {
      // silent
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await api.post("/api/lifemap/refresh", {});
    } catch {
      // silent
    }
    await fetchData();
  }, [fetchData]);

  const generateReport = async () => {
    setGenerating(true);
    try {
      await api.post("/api/weekly", {});
      await fetchData();
    } catch (err) {
      Alert.alert(
        "Cannot generate",
        err instanceof Error ? err.message : "Need at least 3 sessions this week."
      );
    } finally {
      setGenerating(false);
    }
  };

  const latestReport = reports.find((r) => r.status === "COMPLETE");
  const moodEntries = entries.filter((e) => e.moodScore != null);

  if (loading) {
    return (
      <SafeAreaView className="flex-1 bg-[#FAFAF7] dark:bg-[#0B0B12] items-center justify-center" edges={["top"]}>
        <ActivityIndicator color="#7C3AED" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-[#FAFAF7] dark:bg-[#0B0B12]" edges={["top"]}>
      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#7C3AED"
          />
        }
      >
        {/* Header */}
        <View className="mb-6">
          <Text className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">Insights</Text>
          <Text className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
            Your life, decoded.
          </Text>
        </View>

        <UserInsightsCard />

        <ComparisonsCard />

        {/* Theme Map entry card — opens the dedicated force-graph screen. */}
        <Pressable
          onPress={() => router.push("/insights/theme-map")}
          style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
          className="mb-6 rounded-2xl border border-violet-900/30 bg-violet-950/10 p-4"
        >
          <View className="flex-row items-center justify-between">
            <View className="flex-1 pr-3">
              <Text className="text-[11px] font-semibold uppercase tracking-widest text-violet-400">
                New
              </Text>
              <Text className="mt-1 text-base font-semibold text-zinc-900 dark:text-zinc-50">
                Theme Map
              </Text>
              <Text className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                See the patterns your debriefs keep circling.
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#A78BFA" />
          </View>
        </Pressable>

        {/* Memory stats */}
        {memory && memory.totalEntries > 0 && (
          <View className="mb-4">
            <Text className="text-xs text-zinc-400 dark:text-zinc-500">
              {memory.totalEntries} debrief{memory.totalEntries === 1 ? "" : "s"}
              {memory.firstEntryDate &&
                ` · tracking since ${new Date(memory.firstEntryDate).toLocaleDateString("en-US", { month: "short", year: "numeric" })}`}
            </Text>
          </View>
        )}

        {/* Life Matrix radar — top-of-screen anchor for the six-axis view */}
        {areas.length > 0 && (
          <View className="mb-6 rounded-2xl border border-zinc-200 bg-white p-4 dark:border-white/10 dark:bg-[#1E1E2E]">
            <View className="flex-row items-center justify-between mb-3">
              <Text className="text-xs font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">
                Life Matrix
              </Text>
              {/* Current / Trend segmented toggle. Disabled when we
                  don't have ~4 weeks of data yet. */}
              <View className="flex-row rounded-full bg-zinc-100 dark:bg-white/5 p-0.5">
                {(["current", "trend"] as const).map((v) => {
                  const disabled = v === "trend" && !trend?.hasEnoughHistory;
                  return (
                    <Pressable
                      key={v}
                      disabled={disabled}
                      onPress={() => setView(v)}
                      onLongPress={
                        disabled
                          ? () =>
                              Alert.alert(
                                "Not enough history yet",
                                "Check back in a few weeks — we need 4+ weeks of data to show a trend."
                              )
                          : undefined
                      }
                      style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
                      className={`rounded-full px-2.5 py-1 ${
                        view === v
                          ? "bg-white dark:bg-[#1E1E2E]"
                          : "bg-transparent"
                      }`}
                    >
                      <Text
                        className={`text-xs font-semibold ${
                          view === v
                            ? "text-zinc-900 dark:text-zinc-50"
                            : disabled
                              ? "text-zinc-300 dark:text-zinc-600"
                              : "text-zinc-500 dark:text-zinc-400"
                        }`}
                      >
                        {v === "current" ? "Current" : "Trend"}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
            <View className="items-center">
              <LifeMapRadar
                areas={areas.map((a) => ({ area: a.area, score: a.score }))}
                size={300}
                labelColor={isDark ? "#A1A1AA" : "#71717A"}
                scoreColor={isDark ? "#71717A" : "#A1A1AA"}
                gridColor={isDark ? "rgba(255,255,255,0.08)" : "#E4E4E7"}
                centerLabelColor={isDark ? "#FAFAFA" : "#18181B"}
                selectedAreaKey={expandedArea}
                onAreaPress={(key) =>
                  setExpandedArea((prev) => (prev === key ? null : key))
                }
                trendAreas={view === "trend" ? trend?.fourWeeksAgo : undefined}
              />
            </View>
            {view === "trend" && trend?.hasEnoughHistory && (
              <Text className="mt-2 text-xs text-zinc-400 dark:text-zinc-500 text-center">
                Dashed line = ~4 weeks ago
              </Text>
            )}
          </View>
        )}
        {areas.length === 0 && (
          <View className="mb-6 rounded-2xl border border-dashed border-zinc-300 dark:border-white/10 p-6 items-center">
            <Text className="text-2xl mb-2">🧭</Text>
            <Text className="text-sm text-zinc-500 dark:text-zinc-400">
              No Life Matrix scores yet.
            </Text>
            <Text className="text-xs text-zinc-400 dark:text-zinc-500 mt-1 text-center">
              Record a few sessions and your six life areas will populate here.
            </Text>
          </View>
        )}

        {/* Life Matrix area cards — 2 column grid */}
        {areas.length > 0 && (
          <View className="mb-6">
            <Text className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3 dark:text-zinc-500">
              Detail
            </Text>
            <View className="flex-row flex-wrap gap-3">
              {areas.map((area) => {
                const config = DEFAULT_LIFE_AREAS.find((a) => a.enum === area.area);
                const isExpanded = expandedArea === area.area;
                const score100 = area.score * 10;
                const diff = score100 - area.baselineScore;

                return (
                  <Pressable
                    key={area.id}
                    onPress={() =>
                      setExpandedArea(isExpanded ? null : area.area)
                    }
                    className="rounded-2xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#1E1E2E] p-4"
                    style={{ width: "48%" }}
                  >
                    {/* Color top bar */}
                    <View
                      className="h-1 w-10 rounded-full mb-3"
                      style={{ backgroundColor: config?.color ?? "#71717A" }}
                    />
                    <Text className="text-sm font-semibold text-zinc-900 dark:text-zinc-50 mb-1">
                      {area.name ?? area.area}
                    </Text>
                    {/* Score bar */}
                    <View className="h-1.5 w-full rounded-full bg-zinc-100 dark:bg-white/10 mb-2">
                      <View
                        className="h-full rounded-full"
                        style={{
                          width: `${score100}%`,
                          backgroundColor: config?.color ?? "#71717A",
                        }}
                      />
                    </View>
                    <View className="flex-row items-baseline gap-1">
                      <Text className="text-lg font-bold text-zinc-900 dark:text-zinc-50">
                        {score100}
                      </Text>
                      <Text className="text-xs text-zinc-400 dark:text-zinc-500">/100</Text>
                      {area.trend && (
                        <Text
                          className={`text-xs font-medium ml-1 ${
                            area.trend === "up"
                              ? "text-emerald-600"
                              : area.trend === "down"
                              ? "text-red-500"
                              : "text-zinc-400 dark:text-zinc-500"
                          }`}
                        >
                          {area.trend === "up" ? "↑" : area.trend === "down" ? "↓" : "→"}
                        </Text>
                      )}
                    </View>

                    {/* Expanded detail */}
                    {isExpanded && (
                      <View className="mt-3 pt-3 border-t border-zinc-100 dark:border-white/5">
                        {area.insightSummary && (
                          <Text className="text-xs text-zinc-600 dark:text-zinc-300 leading-relaxed mb-2">
                            {area.insightSummary}
                          </Text>
                        )}
                        {area.topThemes.length > 0 && (
                          <View className="flex-row flex-wrap gap-1 mb-2">
                            {area.topThemes.slice(0, 3).map((theme) => (
                              <View
                                key={theme}
                                className="rounded-full bg-zinc-100 dark:bg-white/10 px-2 py-0.5"
                              >
                                <Text className="text-[10px] text-zinc-500 dark:text-zinc-400">
                                  {theme}
                                </Text>
                              </View>
                            ))}
                          </View>
                        )}
                        <Text className="text-[10px] text-zinc-400 dark:text-zinc-500">
                          {diff > 0 ? "+" : ""}
                          {diff} vs baseline · {area.mentionCount} mentions
                        </Text>
                      </View>
                    )}
                  </Pressable>
                );
              })}
            </View>
          </View>
        )}

        {/* Mood chart */}
        {moodEntries.length > 0 ? (
          <View className="rounded-2xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#1E1E2E] p-4 mb-6">
            <Text className="text-xs font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider mb-4">
              Mood Trend
            </Text>
            <View className="flex-row items-end gap-2" style={{ height: 120 }}>
              {moodEntries.map((entry) => {
                const score = entry.moodScore ?? 5;
                const heightPct = (score / 10) * 100;
                const color =
                  MOOD_COLORS[entry.mood ?? "NEUTRAL"] ?? MOOD_COLORS.NEUTRAL;
                const day = new Date(entry.createdAt).toLocaleDateString(
                  "en-US",
                  { weekday: "narrow" }
                );

                return (
                  <View
                    key={entry.id}
                    className="flex-1 items-center gap-1"
                  >
                    <Text className="text-xs text-zinc-400 dark:text-zinc-500">{score}</Text>
                    <View className="w-full items-center" style={{ height: 80 }}>
                      <View
                        className="w-full rounded-t-md"
                        style={{
                          height: `${heightPct}%`,
                          backgroundColor: color,
                          opacity: 0.8,
                          position: "absolute",
                          bottom: 0,
                        }}
                      />
                    </View>
                    <Text className="text-xs text-zinc-400 dark:text-zinc-500">
                      {MOOD_EMOJI[entry.mood ?? "NEUTRAL"] ?? day}
                    </Text>
                  </View>
                );
              })}
            </View>
          </View>
        ) : (
          <View className="rounded-2xl border border-dashed border-zinc-300 dark:border-white/10 p-6 items-center mb-6">
            <Ionicons name="bar-chart-outline" size={32} color="#A1A1AA" />
            <Text className="text-sm font-medium text-zinc-500 dark:text-zinc-400 mt-2">
              No mood data yet
            </Text>
            <Text className="text-xs text-zinc-400 dark:text-zinc-500 mt-1 text-center">
              Record sessions to see your mood trend.
            </Text>
          </View>
        )}

        {/* Generate button */}
        <Pressable
          onPress={generateReport}
          disabled={generating}
          className="rounded-2xl bg-zinc-50 dark:bg-[#13131F] dark:bg-[#1E1E2E] py-4 items-center mb-6"
          style={({ pressed }) => ({
            opacity: pressed || generating ? 0.7 : 1,
          })}
        >
          {generating ? (
            <View className="flex-row items-center gap-2">
              <ActivityIndicator size="small" color="#fff" />
              <Text className="text-sm font-semibold text-white">
                Generating...
              </Text>
            </View>
          ) : (
            <Text className="text-sm font-semibold text-white">
              Generate Weekly Report
            </Text>
          )}
        </Pressable>

        {/* Latest report */}
        {latestReport ? (
          <View className="rounded-2xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#1E1E2E] overflow-hidden">
            <View className="px-4 py-3 border-b border-zinc-100 dark:border-white/5">
              <Text className="text-xs text-zinc-400 dark:text-zinc-500">
                {new Date(latestReport.weekStart).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                })}{" "}
                -{" "}
                {new Date(latestReport.weekEnd).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                })}
              </Text>
              <Text className="text-xs text-zinc-400 dark:text-zinc-500 mt-0.5">
                {latestReport.entryCount} entries ·{" "}
                {latestReport.tasksOpened} tasks ·{" "}
                {latestReport.tasksClosed} closed
              </Text>
            </View>

            {latestReport.narrative && (
              <View className="px-4 py-3 border-b border-zinc-100 dark:border-white/5">
                <Text className="text-sm text-zinc-600 dark:text-zinc-300 leading-relaxed">
                  {latestReport.narrative}
                </Text>
              </View>
            )}

            {latestReport.moodArc && (
              <View className="px-4 py-3 border-b border-zinc-100 dark:border-white/5">
                <Text className="text-xs font-semibold text-zinc-400 dark:text-zinc-500 mb-1">
                  Mood Arc
                </Text>
                <Text className="text-sm text-zinc-500 dark:text-zinc-400">
                  {latestReport.moodArc}
                </Text>
              </View>
            )}

            {latestReport.insightBullets.length > 0 && (
              <View className="px-4 py-3 border-b border-zinc-100 dark:border-white/5">
                <Text className="text-xs font-semibold text-violet-600 mb-2">
                  Insights
                </Text>
                {latestReport.insightBullets.map((bullet, i) => (
                  <View key={i} className="flex-row gap-2 mb-1.5">
                    <Text className="text-violet-500 text-sm">-</Text>
                    <Text className="text-sm text-zinc-600 dark:text-zinc-300 flex-1">
                      {bullet}
                    </Text>
                  </View>
                ))}
              </View>
            )}

            {latestReport.topThemes.length > 0 && (
              <View className="px-4 py-3">
                <Text className="text-xs font-semibold text-zinc-400 dark:text-zinc-500 mb-2">
                  Top Themes
                </Text>
                <View className="flex-row flex-wrap gap-1.5">
                  {latestReport.topThemes.map((theme) => (
                    <View
                      key={theme}
                      className="rounded-full bg-zinc-100 dark:bg-white/10 px-2.5 py-1"
                    >
                      <Text className="text-xs text-zinc-500 dark:text-zinc-400">{theme}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}
          </View>
        ) : (
          <View className="rounded-2xl border border-dashed border-zinc-300 dark:border-white/10 p-8 items-center">
            <Ionicons name="bulb-outline" size={40} color="#A1A1AA" />
            <Text className="text-sm font-medium text-zinc-500 dark:text-zinc-400 mt-3">
              No weekly report yet
            </Text>
            <Text className="text-xs text-zinc-400 dark:text-zinc-500 mt-1 text-center px-4">
              Record at least 3 sessions, then tap Generate Weekly Report.
            </Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
