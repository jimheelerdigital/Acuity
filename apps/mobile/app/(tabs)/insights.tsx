import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
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

import {
  MOOD_EMOJI,
  DEFAULT_LIFE_AREAS,
  type EntryDTO,
  type UserProgression,
} from "@acuity/shared";

import { ComparisonsCard } from "@/components/comparisons-card";
import { LifeMapRadar } from "@/components/life-map-radar";
import { LockedFeatureCard } from "@/components/locked-feature-card";
import { UserInsightsCard } from "@/components/user-insights-card";
import { useTheme } from "@/contexts/theme-context";
import { api } from "@/lib/api";
import { fetchUserProgression } from "@/lib/userProgression";

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
  const [metricsOpen, setMetricsOpen] = useState(false);
  const [progression, setProgression] = useState<UserProgression | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const [entriesRes, reportsRes, lifeMapRes, trendRes, prog] =
        await Promise.all([
          api.get<{ entries: EntryDTO[] }>("/api/entries"),
          api.get<{ reports: Report[] }>("/api/weekly"),
          api.get<{ areas: LifeMapAreaData[]; memory: MemoryData }>(
            "/api/lifemap"
          ),
          api
            .get<{
              hasEnoughHistory: boolean;
              fourWeeksAgo: Array<{ area: string; score: number | null }>;
            }>("/api/lifemap/trend")
            .catch(() => null),
          fetchUserProgression().catch(() => null),
        ]);
      setEntries(entriesRes.entries ?? []);
      setReports(reportsRes.reports ?? []);
      setAreas(lifeMapRes.areas ?? []);
      setMemory(lifeMapRes.memory ?? null);
      setTrend(trendRes);
      setProgression(prog);
    } catch {
      // silent
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Re-fetch on every tab focus so returning from the /record modal
  // refreshes the progression counters (e.g. "5 of 10" → "6 of 10")
  // without requiring a pull-to-refresh.
  useFocusEffect(
    useCallback(() => {
      fetchData();
    }, [fetchData])
  );

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
        err instanceof Error
          ? err.message
          : "Need at least 3 sessions this week."
      );
    } finally {
      setGenerating(false);
    }
  };

  const latestReport = reports.find((r) => r.status === "COMPLETE");
  const moodEntries = entries.filter((e) => e.moodScore != null).slice(0, 7);
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const timelineEntries = entries
    .filter((e) => new Date(e.createdAt).getTime() >= sevenDaysAgo)
    .slice(0, 12);

  if (loading) {
    return (
      <SafeAreaView
        className="flex-1 bg-[#FAFAF7] dark:bg-[#0B0B12] items-center justify-center"
        edges={["top"]}
      >
        <ActivityIndicator color="#7C3AED" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      className="flex-1 bg-[#FAFAF7] dark:bg-[#0B0B12]"
      edges={["top"]}
    >
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
          <Text className="text-3xl font-bold text-zinc-900 dark:text-zinc-50">
            Insights
          </Text>
          <Text className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
            Your life, decoded.
          </Text>
        </View>

        {/* ─── 1. LIFE MATRIX — hero ─────────────────────────────────── */}
        {progression && !progression.unlocked.lifeMatrix ? (
          <View className="mb-6">
            <LockedFeatureCard
              unlockKey="lifeMatrix"
              progression={progression}
            />
          </View>
        ) : areas.length > 0 ? (
          <View className="mb-6 rounded-2xl border border-zinc-200 bg-white p-4 dark:border-white/10 dark:bg-[#1E1E2E]">
            <View className="flex-row items-center justify-between mb-3">
              <Text className="text-xs font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">
                Life Matrix
              </Text>
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
                size={320}
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
        ) : (
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

        {/* Life Matrix area cards — 2 col grid, right below the radar */}
        {areas.length > 0 && (
          <View className="mb-8">
            <Text className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3 dark:text-zinc-500">
              Area detail
            </Text>
            <View className="flex-row flex-wrap gap-3">
              {areas.map((area) => {
                const config = DEFAULT_LIFE_AREAS.find(
                  (a) => a.enum === area.area
                );
                const score100 = area.score * 10;

                return (
                  <Pressable
                    key={area.id}
                    onPress={() => {
                      // Route to the drill-down modal. Key is the
                      // lowercase dimension identifier, which the
                      // /api/lifemap/dimension/[key] endpoint expects.
                      if (config?.key) {
                        router.push(`/dimension/${config.key}`);
                      }
                    }}
                    className="rounded-2xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#1E1E2E] p-4"
                    style={{ width: "48%" }}
                  >
                    <View
                      className="h-1 w-10 rounded-full mb-3"
                      style={{ backgroundColor: config?.color ?? "#71717A" }}
                    />
                    <Text className="text-sm font-semibold text-zinc-900 dark:text-zinc-50 mb-1">
                      {area.name ?? area.area}
                    </Text>
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
                      <Text className="text-xs text-zinc-400 dark:text-zinc-500">
                        /100
                      </Text>
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
                          {area.trend === "up"
                            ? "↑"
                            : area.trend === "down"
                              ? "↓"
                              : "→"}
                        </Text>
                      )}
                    </View>
                  </Pressable>
                );
              })}
            </View>
          </View>
        )}

        {/* ─── 2. TIMELINE / RECENT ACTIVITY ─────────────────────────── */}
        {timelineEntries.length >= 3 ? (
          <View className="mb-8">
            <View className="flex-row items-center justify-between mb-3">
              <Text className="text-xs font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">
                Recent activity
              </Text>
              <Pressable onPress={() => router.push("/(tabs)/entries")}>
                <Text className="text-xs text-violet-600 dark:text-violet-400">
                  View all →
                </Text>
              </Pressable>
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 10, paddingRight: 4 }}
            >
              {timelineEntries.map((entry) => {
                const summary =
                  entry.summary ??
                  (entry.transcript
                    ? entry.transcript.slice(0, 80) +
                      (entry.transcript.length > 80 ? "…" : "")
                    : "");
                const when = new Date(entry.createdAt);
                const day = when.toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                });
                const time = when.toLocaleTimeString("en-US", {
                  hour: "numeric",
                  minute: "2-digit",
                });
                return (
                  <Pressable
                    key={entry.id}
                    onPress={() => router.push(`/entry/${entry.id}`)}
                    style={({ pressed }) => ({ opacity: pressed ? 0.75 : 1 })}
                    className="w-56 rounded-2xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#1E1E2E] p-3"
                  >
                    <View className="flex-row items-center gap-2 mb-2">
                      <Text style={{ fontSize: 18 }}>
                        {MOOD_EMOJI[entry.mood ?? "NEUTRAL"] ?? "•"}
                      </Text>
                      <View className="flex-1">
                        <Text className="text-xs font-semibold text-zinc-600 dark:text-zinc-300">
                          {day}
                        </Text>
                        <Text className="text-[10px] text-zinc-400 dark:text-zinc-500">
                          {time}
                        </Text>
                      </View>
                    </View>
                    <Text
                      className="text-xs text-zinc-600 dark:text-zinc-300 leading-snug"
                      numberOfLines={4}
                    >
                      {summary || "No summary available."}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        ) : null}

        {/* ─── 3. THEME MAP ────────────────────────────────────────── */}
        {progression && !progression.unlocked.themeMap ? (
          <View className="mb-4">
            <LockedFeatureCard
              unlockKey="themeMap"
              progression={progression}
            />
          </View>
        ) : (
          <Pressable
            onPress={() => router.push("/insights/theme-map")}
            style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
            className="mb-4 rounded-2xl border border-violet-900/30 bg-violet-950/10 p-4"
          >
            <View className="flex-row items-center justify-between">
              <View className="flex-1 pr-3">
                <Text className="text-[11px] font-semibold uppercase tracking-widest text-violet-400">
                  Explore
                </Text>
                <Text className="mt-1 text-base font-semibold text-zinc-900 dark:text-zinc-50">
                  Theme Map
                </Text>
                <Text className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                  The patterns your debriefs keep circling.
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#A78BFA" />
            </View>
          </Pressable>
        )}

        {/* ─── 4. ASK YOUR PAST SELF (web-linked from mobile) ────── */}
        <Pressable
          onPress={() => router.push("/insights/ask" as never)}
          style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
          className="mb-4 rounded-2xl border border-indigo-900/30 bg-indigo-950/10 p-4"
        >
          <View className="flex-row items-center justify-between">
            <View className="flex-1 pr-3">
              <Text className="text-[11px] font-semibold uppercase tracking-widest text-indigo-400">
                Ask
              </Text>
              <Text className="mt-1 text-base font-semibold text-zinc-900 dark:text-zinc-50">
                Ask your past self
              </Text>
              <Text className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                Natural-language questions across your own journal history.
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#818CF8" />
          </View>
        </Pressable>

        {/* ─── 5. STATE OF ME ──────────────────────────────────────── */}
        <Pressable
          onPress={() => router.push("/insights/state-of-me" as never)}
          style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
          className="mb-6 rounded-2xl border border-amber-900/30 bg-amber-950/10 p-4"
        >
          <View className="flex-row items-center justify-between">
            <View className="flex-1 pr-3">
              <Text className="text-[11px] font-semibold uppercase tracking-widest text-amber-400">
                Quarterly
              </Text>
              <Text className="mt-1 text-base font-semibold text-zinc-900 dark:text-zinc-50">
                State of Me
              </Text>
              <Text className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                Every 90 days — a long-form read across the quarter.
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#FBBF24" />
          </View>
        </Pressable>

        {/* ─── 6. WEEKLY REPORT ────────────────────────────────────── */}
        <View className="mb-6">
          <Text className="text-xs font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider mb-3">
            Weekly report
          </Text>
          {progression && !progression.unlocked.weeklyReport ? (
            <LockedFeatureCard
              unlockKey="weeklyReport"
              progression={progression}
            />
          ) : (
          <>
          <Pressable
            onPress={generateReport}
            disabled={generating}
            className="rounded-2xl bg-zinc-900 dark:bg-violet-600 py-3 items-center mb-3"
            style={({ pressed }) => ({
              opacity: pressed || generating ? 0.7 : 1,
            })}
          >
            {generating ? (
              <View className="flex-row items-center gap-2">
                <ActivityIndicator size="small" color="#fff" />
                <Text className="text-sm font-semibold text-white">
                  Generating…
                </Text>
              </View>
            ) : (
              <Text className="text-sm font-semibold text-white">
                Generate weekly report
              </Text>
            )}
          </Pressable>
          {latestReport ? (
            <View className="rounded-2xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#1E1E2E] overflow-hidden">
              <View className="px-4 py-3 border-b border-zinc-100 dark:border-white/5">
                <Text className="text-xs text-zinc-400 dark:text-zinc-500">
                  {new Date(latestReport.weekStart).toLocaleDateString(
                    "en-US",
                    { month: "short", day: "numeric" }
                  )}{" "}
                  –{" "}
                  {new Date(latestReport.weekEnd).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                  })}
                </Text>
                <Text className="text-xs text-zinc-400 dark:text-zinc-500 mt-0.5">
                  {latestReport.entryCount} entries ·{" "}
                  {latestReport.tasksOpened} tasks · {latestReport.tasksClosed}{" "}
                  closed
                </Text>
              </View>
              {latestReport.narrative && (
                <View className="px-4 py-3 border-b border-zinc-100 dark:border-white/5">
                  <Text className="text-sm text-zinc-600 dark:text-zinc-300 leading-relaxed">
                    {latestReport.narrative}
                  </Text>
                </View>
              )}
              {latestReport.insightBullets.length > 0 && (
                <View className="px-4 py-3">
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
            </View>
          ) : (
            <View className="rounded-2xl border border-dashed border-zinc-300 dark:border-white/10 p-6 items-center">
              <Ionicons name="bulb-outline" size={32} color="#A1A1AA" />
              <Text className="text-sm font-medium text-zinc-500 dark:text-zinc-400 mt-2">
                No weekly report yet
              </Text>
              <Text className="text-xs text-zinc-400 dark:text-zinc-500 mt-1 text-center px-4">
                Record 3+ sessions, then generate.
              </Text>
            </View>
          )}
          </>
          )}
        </View>

        {/* ─── 7. METRICS — collapsible at the bottom ─────────────── */}
        <Pressable
          onPress={() => setMetricsOpen((open) => !open)}
          className="mb-3 rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#1E1E2E] px-4 py-3"
        >
          <View className="flex-row items-center justify-between">
            <Text className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
              Metrics & observations
            </Text>
            <Ionicons
              name={metricsOpen ? "chevron-up" : "chevron-down"}
              size={16}
              color="#A1A1AA"
            />
          </View>
        </Pressable>
        {metricsOpen && (
          <>
            {progression && !progression.unlocked.patternInsights ? (
              <View className="mb-4">
                <LockedFeatureCard
                  unlockKey="patternInsights"
                  progression={progression}
                />
              </View>
            ) : (
              <UserInsightsCard />
            )}
            <ComparisonsCard />

            {/* Mood chart — legacy 7-bar view, kept in the metrics drawer */}
            {moodEntries.length > 0 && (
              <View className="rounded-2xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#1E1E2E] p-4 mb-6">
                <Text className="text-xs font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider mb-4">
                  Mood trend
                </Text>
                <View className="flex-row items-end gap-2" style={{ height: 120 }}>
                  {moodEntries.map((entry) => {
                    const score = entry.moodScore ?? 5;
                    const heightPct = (score / 10) * 100;
                    const color =
                      MOOD_COLORS[entry.mood ?? "NEUTRAL"] ??
                      MOOD_COLORS.NEUTRAL;
                    const day = new Date(entry.createdAt).toLocaleDateString(
                      "en-US",
                      { weekday: "narrow" }
                    );
                    return (
                      <View
                        key={entry.id}
                        className="flex-1 items-center gap-1"
                      >
                        <Text className="text-xs text-zinc-400 dark:text-zinc-500">
                          {score}
                        </Text>
                        <View
                          className="w-full items-center"
                          style={{ height: 80 }}
                        >
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
            )}

            {memory && memory.totalEntries > 0 && (
              <View className="mb-6">
                <Text className="text-xs text-zinc-400 dark:text-zinc-500">
                  {memory.totalEntries} debrief
                  {memory.totalEntries === 1 ? "" : "s"}
                  {memory.firstEntryDate &&
                    ` · tracking since ${new Date(memory.firstEntryDate).toLocaleDateString("en-US", { month: "short", year: "numeric" })}`}
                </Text>
              </View>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
