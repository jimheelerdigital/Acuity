import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  DEFAULT_LIFE_AREAS,
  type EntryDTO,
  type UserProgression,
} from "@acuity/shared";

import { SegmentedTabs } from "@/components/acuity";
import { ComparisonsCard } from "@/components/comparisons-card";
import { BiggestMoves } from "@/components/insights/biggest-moves";
import { LifeMapRadar } from "@/components/life-map-radar";
import { LockedFeatureCard } from "@/components/locked-feature-card";
import { MoodIcon } from "@/components/mood-icon";
import { ProLockedCard } from "@/components/pro-locked-card";
import { UserInsightsCard } from "@/components/user-insights-card";
import { useAuth } from "@/contexts/auth-context";
import { useTheme } from "@/contexts/theme-context";
import { api } from "@/lib/api";
import { getCached, isStale, setCached } from "@/lib/cache";
import { isFreeTierUser } from "@/lib/free-tier";
import { moodToneColor, WARN_AMBER } from "@/lib/tone-colors";
import { fetchUserProgression } from "@/lib/userProgression";

const INSIGHTS_ENTRIES_KEY = "/api/entries";
const INSIGHTS_WEEKLY_KEY = "/api/weekly";
const INSIGHTS_LIFEMAP_KEY = "/api/lifemap";
const INSIGHTS_LIFEMAP_TREND_KEY = "/api/lifemap/trend";
const INSIGHTS_PROGRESSION_KEY = "/api/user/progression";

type LifeMapResponse = { areas: LifeMapAreaData[]; memory: MemoryData };
type TrendResponse = {
  hasEnoughHistory: boolean;
  fourWeeksAgo: Array<{ area: string; score: number | null }>;
};

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
  /** Legacy 1-10 score (build-42 contract). */
  score: number;
  /**
   * Slice N canonical 0-100 score. Optional during transition —
   * absent on build-42 / un-backfilled rows; consumers must fall
   * back to `score * 10` when missing.
   */
  score100?: number;
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

// Q11 Phase C.2 (2026-05-21): hardcoded MOOD_COLORS hex table moved
// to @/lib/mood-tones.ts as moodToneColor(mood, tokens). The new
// helper resolves to tokens.good / tokens.bad / amber / tokens.textTer
// at render time so mood accents re-skin with the active palette.
// See lib/mood-tones.ts for the mood→tone mapping rationale.

export default function InsightsTab() {
  const router = useRouter();
  const { user } = useAuth();
  const isProLocked = isFreeTierUser(user);
  const { resolved: resolvedTheme, tokens } = useTheme();
  const isDark = resolvedTheme === "dark";
  const [entries, setEntries] = useState<EntryDTO[]>(
    () =>
      getCached<{ entries: EntryDTO[] }>(INSIGHTS_ENTRIES_KEY)?.entries ?? []
  );
  const [reports, setReports] = useState<Report[]>(
    () =>
      getCached<{ reports: Report[] }>(INSIGHTS_WEEKLY_KEY)?.reports ?? []
  );
  const initialLifeMap = getCached<LifeMapResponse>(INSIGHTS_LIFEMAP_KEY);
  const [areas, setAreas] = useState<LifeMapAreaData[]>(
    () => initialLifeMap?.areas ?? []
  );
  const [memory, setMemory] = useState<MemoryData | null>(
    () => initialLifeMap?.memory ?? null
  );
  const [expandedArea, setExpandedArea] = useState<string | null>(null);
  const [loading, setLoading] = useState(
    () => !getCached<LifeMapResponse>(INSIGHTS_LIFEMAP_KEY)
  );
  const [refreshing, setRefreshing] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [view, setView] = useState<"current" | "trend">("current");
  const [trend, setTrend] = useState<TrendResponse | null>(
    () => getCached<TrendResponse>(INSIGHTS_LIFEMAP_TREND_KEY) ?? null
  );
  const [metricsOpen, setMetricsOpen] = useState(false);
  const [progression, setProgression] = useState<UserProgression | null>(
    () => getCached<UserProgression>(INSIGHTS_PROGRESSION_KEY) ?? null
  );

  // Q7 — orbital entrance for the Life Matrix radar. Plays once per
  // session on the first focus event where areas data is available.
  // The played-once ref gates against tab-switch + data-refresh
  // re-plays. Shared values start at "off-screen" so the entrance
  // is the FIRST thing the user sees the very first time they
  // open Insights this session.
  const entrancePlayedRef = useRef(false);
  const radarScale = useSharedValue(0.92);
  const radarOpacity = useSharedValue(0);
  const radarStyle = useAnimatedStyle(() => ({
    transform: [{ scale: radarScale.value }],
    opacity: radarOpacity.value,
  }));

  const fetchData = useCallback(async () => {
    try {
      const [entriesRes, reportsRes, lifeMapRes, trendRes, prog] =
        await Promise.all([
          api.get<{ entries: EntryDTO[] }>(INSIGHTS_ENTRIES_KEY),
          api.get<{ reports: Report[] }>(INSIGHTS_WEEKLY_KEY),
          api.get<LifeMapResponse>(INSIGHTS_LIFEMAP_KEY),
          api
            .get<TrendResponse>(INSIGHTS_LIFEMAP_TREND_KEY)
            .catch(() => null),
          fetchUserProgression().catch(() => null),
        ]);
      setCached(INSIGHTS_ENTRIES_KEY, entriesRes);
      setCached(INSIGHTS_WEEKLY_KEY, reportsRes);
      setCached(INSIGHTS_LIFEMAP_KEY, lifeMapRes);
      if (trendRes) setCached(INSIGHTS_LIFEMAP_TREND_KEY, trendRes);
      if (prog) setCached(INSIGHTS_PROGRESSION_KEY, prog);
      setEntries(entriesRes.entries ?? []);
      setReports(reportsRes.reports ?? []);
      // Filter out the OTHER sentinel left over from the 6→10 axis
      // migration (Phase D). It's not in DEFAULT_LIFE_AREAS canonical
      // and never gets updated by extraction; including it shows an
      // 11th "Other" card that doesn't belong in the 10-axis matrix.
      // Server-side DB cleanup happens separately.
      setAreas(
        (lifeMapRes.areas ?? []).filter((a) => a.area !== "OTHER")
      );
      setMemory(lifeMapRes.memory ?? null);
      setTrend(trendRes);
      setProgression(prog);
    } catch {
      // Keep cached state on failure.
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Revalidate on focus only when stale (30s TTL). Cached UI stays
  // painted during the background fetch so the tab switch is instant.
  useFocusEffect(
    useCallback(() => {
      if (
        isStale(INSIGHTS_LIFEMAP_KEY) ||
        isStale(INSIGHTS_ENTRIES_KEY) ||
        isStale(INSIGHTS_PROGRESSION_KEY)
      ) {
        fetchData();
      }
    }, [fetchData])
  );

  // Q7 — fire the radar entrance once per session, gated on data.
  // When the tab focuses with data available AND we haven't played
  // yet, run the scale+opacity entrance. Data-refetch focus events
  // are no-ops via the ref. eslint deps complain about the shared
  // values but they're stable references so it's safe to omit.
  useFocusEffect(
    useCallback(() => {
      if (entrancePlayedRef.current) return;
      if (areas.length === 0) return;
      entrancePlayedRef.current = true;
      radarScale.value = withTiming(1, {
        duration: 700,
        easing: Easing.bezier(0.16, 0.9, 0.3, 1),
      });
      radarOpacity.value = withTiming(1, {
        duration: 700,
        easing: Easing.bezier(0.16, 0.9, 0.3, 1),
      });
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [areas.length])
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
        className="flex-1 items-center justify-center"
        edges={["top"]}
        style={{ backgroundColor: tokens.bg }}
      >
        <ActivityIndicator color={tokens.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      className="flex-1"
      edges={["top"]}
      style={{ backgroundColor: tokens.bg }}
    >
      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={tokens.primary}
          />
        }
      >
        {/* Header */}
        <View className="mb-6">
          <Text
            className="text-4xl font-bold"
            style={{ color: tokens.text }}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.75}
          >
            Insights
          </Text>
          <Text
            className="text-base mt-1"
            style={{ color: tokens.textSec }}
          >
            Your life, decoded.
          </Text>
        </View>

        {/* ─── 1. LIFE MATRIX — hero ─────────────────────────────────── */}
        {/* §B.2.2 — billing gate (FREE post-trial) takes precedence
            over the experiential gate. */}
        {isProLocked ? (
          <View className="mb-6">
            <ProLockedCard surfaceId="life_matrix_locked" />
          </View>
        ) : progression && !progression.unlocked.lifeMatrix ? (
          <View className="mb-6">
            <LockedFeatureCard
              unlockKey="lifeMatrix"
              progression={progression}
            />
          </View>
        ) : areas.length > 0 ? (
          <View
            className="mb-6 rounded-2xl border p-4"
            style={{
              borderColor: tokens.line,
              backgroundColor: tokens.cardBg,
            }}
          >
            <View className="flex-row items-center justify-between mb-3">
              <Text
                className="text-xs font-semibold uppercase tracking-wider"
                style={{ color: tokens.textTer }}
              >
                Life Matrix
              </Text>
              {/* Q7 — SegmentedTabs swap. "Trend" only appears when
                  hasEnoughHistory is true; previously it was disabled-
                  with-long-press-alert. Cleaner UX, lighter primitive
                  surface (no need to add disabled support upstream).

                  Phase D polish 3 (2026-05-21): wrapped in a fixed-
                  width View. SegmentedTabs has flex:1 Pressables
                  inside a flex-row container with no own width — in
                  RN's measurement model that produces ambiguous
                  layout against a flex-row parent with no width
                  constraint, which manifested as Trend pill clipping
                  off the right edge on iPhone 16e. A definite width
                  on the wrapper resolves the ambiguity; 180pt holds
                  both pills with breathing room, 110pt for the
                  single-tab case. Card inner = 303pt; eyebrow ~110pt;
                  180pt tabs leaves ~13pt of margin against the right
                  card edge — generous and tested. */}
              <View
                style={{
                  width: trend?.hasEnoughHistory ? 180 : 110,
                }}
              >
                <SegmentedTabs<"current" | "trend">
                  tabs={
                    trend?.hasEnoughHistory
                      ? [
                          { id: "current", label: "Current" },
                          { id: "trend", label: "Trend" },
                        ]
                      : [{ id: "current", label: "Current" }]
                  }
                  activeId={view}
                  onChange={setView}
                />
              </View>
            </View>
            <Animated.View
              style={[{ alignItems: "center" }, radarStyle]}
            >
              <LifeMapRadar
                areas={areas.map((a) => ({
                  area: a.area,
                  score: a.score,
                  score100: a.score100,
                }))}
                size={320}
                labelColor={tokens.textSec}
                scoreColor={tokens.textSec}
                mutedLabelColor={tokens.textTer}
                gridColor={tokens.line}
                centerLabelColor={tokens.text}
                selectedAreaKey={expandedArea}
                onAreaPress={(key) =>
                  setExpandedArea((prev) => (prev === key ? null : key))
                }
                trendAreas={view === "trend" ? trend?.fourWeeksAgo : undefined}
                // Q7 polish — palette-gradient polygon, mono labels.
                gradientColors={[tokens.primary, tokens.secondary]}
                labelFontFamily={tokens.fontMono}
                scoreFontFamily={tokens.fontMono}
                nodeStrokeColor={tokens.bg}
                // Phase D polish 2 — honest empty-state hint when every
                // axis is at zero (brand-new user, no entries yet).
                emptyHint="Record an entry to start mapping your life axes."
                emptyHintFontFamily={tokens.fontSans}
              />
            </Animated.View>
            {view === "trend" && trend?.hasEnoughHistory && (
              <Text
                className="mt-2 text-xs text-center"
                style={{ color: tokens.textTer }}
              >
                Dashed line = ~4 weeks ago
              </Text>
            )}
            {/* Q7 — Biggest moves: top areas sorted by |weeklyDelta|,
                palette-tinted for direction. Sits below the radar so
                it reads as a continuation of the Life Matrix narrative. */}
            <BiggestMoves areas={areas} />
          </View>
        ) : (
          <View
            className="mb-6 rounded-2xl border border-dashed p-6 items-center"
            style={{ borderColor: tokens.line }}
          >
            <Text className="text-2xl mb-2">🧭</Text>
            <Text className="text-sm" style={{ color: tokens.textSec }}>
              No Life Matrix scores yet.
            </Text>
            <Text
              className="text-xs mt-1 text-center"
              style={{ color: tokens.textTer }}
            >
              Record a few sessions and your life areas will populate here.
            </Text>
          </View>
        )}

        {/* Life Matrix area cards — 2 col grid, right below the radar */}
        {areas.length > 0 && (
          <View className="mb-8">
            <Text
              className="text-xs font-semibold uppercase tracking-wider mb-3"
              style={{ color: tokens.textTer }}
            >
              Area detail
            </Text>
            <View className="flex-row flex-wrap gap-3">
              {areas.map((area) => {
                const config = DEFAULT_LIFE_AREAS.find(
                  (a) => a.enum === area.area
                );
                // Prefer Slice N canonical score100; fall back to the
                // legacy 10x derivation for un-backfilled rows.
                const score100 = Math.max(
                  0,
                  Math.min(
                    100,
                    Math.round(
                      typeof area.score100 === "number"
                        ? area.score100
                        : area.score * 10
                    )
                  )
                );

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
                    className="rounded-2xl border p-4"
                    style={{
                      width: "48%",
                      borderColor: tokens.line,
                      backgroundColor: tokens.cardBg,
                    }}
                  >
                    {/* Q11c.2: config.color (DEFAULT_LIFE_AREAS data
                        color) no longer drives the per-area tint —
                        uses tokens.primary uniformly. Same convention
                        as Q11a-1's goals area pill + Q11c-1's group
                        header tint. */}
                    <View
                      className="h-1 w-10 rounded-full mb-3"
                      style={{ backgroundColor: tokens.primary }}
                    />
                    <Text
                      className="text-sm font-semibold mb-1"
                      style={{ color: tokens.text }}
                    >
                      {area.name ?? area.area}
                    </Text>
                    <View
                      className="h-1.5 w-full rounded-full mb-2"
                      style={{ backgroundColor: tokens.bgInset }}
                    >
                      <View
                        className="h-full rounded-full"
                        style={{
                          width: `${score100}%`,
                          backgroundColor: tokens.primary,
                        }}
                      />
                    </View>
                    <View className="flex-row items-baseline gap-1">
                      <Text
                        className="text-lg font-bold"
                        style={{ color: tokens.text }}
                      >
                        {score100}
                      </Text>
                      <Text
                        className="text-xs"
                        style={{ color: tokens.textTer }}
                      >
                        /100
                      </Text>
                      {area.trend && (
                        <Text
                          className="text-xs font-medium ml-1"
                          style={{
                            color:
                              area.trend === "up"
                                ? tokens.good
                                : area.trend === "down"
                                  ? tokens.bad
                                  : tokens.textTer,
                          }}
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
              <Text
                className="text-xs font-semibold uppercase tracking-wider"
                style={{ color: tokens.textTer }}
              >
                Recent activity
              </Text>
              <Pressable onPress={() => router.push("/(tabs)/entries")}>
                <Text
                  className="text-xs"
                  style={{ color: tokens.primary }}
                >
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
                    className="w-56 rounded-2xl border p-3"
                    style={{
                      borderColor: tokens.line,
                      backgroundColor: tokens.cardBg,
                    }}
                  >
                    <View className="flex-row items-center gap-2 mb-2">
                      <MoodIcon
                        mood={entry.mood ?? "NEUTRAL"}
                        size={16}
                        color={tokens.textTer}
                      />
                      <View className="flex-1">
                        <Text
                          className="text-xs font-semibold"
                          style={{ color: tokens.textSec }}
                        >
                          {day}
                        </Text>
                        <Text
                          className="text-[10px]"
                          style={{ color: tokens.textTer }}
                        >
                          {time}
                        </Text>
                      </View>
                    </View>
                    <Text
                      className="text-xs leading-snug"
                      numberOfLines={4}
                      style={{ color: tokens.textSec }}
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
        {/* §B.2.5 — billing gate (FREE post-trial) takes precedence. */}
        {isProLocked ? (
          <View className="mb-4">
            <ProLockedCard surfaceId="theme_map_locked" />
          </View>
        ) : progression && !progression.unlocked.themeMap ? (
          <View className="mb-4">
            <LockedFeatureCard
              unlockKey="themeMap"
              progression={progression}
            />
          </View>
        ) : (
          <Pressable
            onPress={() => router.push("/insights/theme-map")}
            className="mb-4 rounded-2xl border p-4"
            style={{
              borderColor: `${tokens.primary}55`,
              backgroundColor: `${tokens.primary}14`,
            }}
          >
            <View className="flex-row items-center justify-between">
              <View className="flex-1 pr-3">
                <Text
                  className="text-[11px] font-semibold uppercase tracking-widest"
                  style={{ color: tokens.primary }}
                >
                  Explore
                </Text>
                <Text
                  className="mt-1 text-base font-semibold"
                  style={{ color: tokens.text }}
                >
                  Theme Map
                </Text>
                <Text
                  className="mt-0.5 text-xs"
                  style={{ color: tokens.textSec }}
                >
                  The patterns your debriefs keep circling.
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={tokens.primary} />
            </View>
          </Pressable>
        )}

        {/* ─── 4. ASK YOUR PAST SELF (web-linked from mobile) ────── */}
        <Pressable
          onPress={() => router.push("/insights/ask" as never)}
          className="mb-4 rounded-2xl border p-4"
          style={{
            borderColor: `${tokens.secondary}55`,
            backgroundColor: `${tokens.secondary}14`,
          }}
        >
          <View className="flex-row items-center justify-between">
            <View className="flex-1 pr-3">
              <Text
                className="text-[11px] font-semibold uppercase tracking-widest"
                style={{ color: tokens.secondary }}
              >
                Ask
              </Text>
              <Text
                className="mt-1 text-base font-semibold"
                style={{ color: tokens.text }}
              >
                Ask your past self
              </Text>
              <Text
                className="mt-0.5 text-xs"
                style={{ color: tokens.textSec }}
              >
                Natural-language questions across your own journal history.
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={tokens.secondary} />
          </View>
        </Pressable>

        {/* ─── 5. STATE OF ME ──────────────────────────────────────── */}
        {/* "Quarterly" surface uses WARN_AMBER from lib/tone-colors
            — single source of truth for the warning-amber accent.
            Surrounds it as a distinct visual cue from the primary-
            tinted Theme Map card above. */}
        <Pressable
          onPress={() => router.push("/insights/state-of-me" as never)}
          className="mb-6 rounded-2xl border p-4"
          style={{
            borderColor: `${WARN_AMBER}4d`,
            backgroundColor: `${WARN_AMBER}14`,
          }}
        >
          <View className="flex-row items-center justify-between">
            <View className="flex-1 pr-3">
              <Text
                className="text-[11px] font-semibold uppercase tracking-widest"
                style={{ color: WARN_AMBER }}
              >
                Quarterly
              </Text>
              <Text
                className="mt-1 text-base font-semibold"
                style={{ color: tokens.text }}
              >
                State of Me
              </Text>
              <Text
                className="mt-0.5 text-xs"
                style={{ color: tokens.textSec }}
              >
                Every 90 days — a long-form read across the quarter.
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={WARN_AMBER} />
          </View>
        </Pressable>

        {/* ─── 6. WEEKLY REPORT ────────────────────────────────────── */}
        <View className="mb-6">
          <Text
            className="text-xs font-semibold uppercase tracking-wider mb-3"
            style={{ color: tokens.textTer }}
          >
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
            className="rounded-2xl py-3 items-center mb-3"
            style={{
              backgroundColor: tokens.primary,
              opacity: generating ? 0.7 : 1,
            }}
          >
            {generating ? (
              <View className="flex-row items-center gap-2">
                <ActivityIndicator size="small" color="#FFFFFF" />
                <Text
                  className="text-sm font-semibold"
                  style={{ color: "#FFFFFF" }}
                >
                  Generating…
                </Text>
              </View>
            ) : (
              <Text
                className="text-sm font-semibold"
                style={{ color: "#FFFFFF" }}
              >
                Generate weekly report
              </Text>
            )}
          </Pressable>
          {latestReport ? (
            <View
              className="rounded-2xl border overflow-hidden"
              style={{
                borderColor: tokens.line,
                backgroundColor: tokens.cardBg,
              }}
            >
              <View
                className="px-4 py-3 border-b"
                style={{ borderColor: tokens.line }}
              >
                <Text
                  className="text-xs"
                  style={{ color: tokens.textTer }}
                >
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
                <Text
                  className="text-xs mt-0.5"
                  style={{ color: tokens.textTer }}
                >
                  {latestReport.entryCount} entries ·{" "}
                  {latestReport.tasksOpened} tasks · {latestReport.tasksClosed}{" "}
                  closed
                </Text>
              </View>
              {latestReport.narrative && (
                <View
                  className="px-4 py-3 border-b"
                  style={{ borderColor: tokens.line }}
                >
                  <Text
                    className="text-sm leading-relaxed"
                    style={{ color: tokens.textSec }}
                  >
                    {latestReport.narrative}
                  </Text>
                </View>
              )}
              {latestReport.insightBullets.length > 0 && (
                <View className="px-4 py-3">
                  <Text
                    className="text-xs font-semibold mb-2"
                    style={{ color: tokens.primary }}
                  >
                    Insights
                  </Text>
                  {latestReport.insightBullets.map((bullet, i) => (
                    <View key={i} className="flex-row gap-2 mb-1.5">
                      <Text
                        className="text-sm"
                        style={{ color: tokens.primary }}
                      >
                        -
                      </Text>
                      <Text
                        className="text-sm flex-1"
                        style={{ color: tokens.textSec }}
                      >
                        {bullet}
                      </Text>
                    </View>
                  ))}
                </View>
              )}
            </View>
          ) : (
            <View
              className="rounded-2xl border border-dashed p-6 items-center"
              style={{ borderColor: tokens.line }}
            >
              <Ionicons name="bulb-outline" size={32} color={tokens.textTer} />
              <Text
                className="text-sm font-medium mt-2"
                style={{ color: tokens.textSec }}
              >
                No weekly report yet
              </Text>
              <Text
                className="text-xs mt-1 text-center px-4"
                style={{ color: tokens.textTer }}
              >
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
          className="mb-3 rounded-xl border px-4 py-3"
          style={{
            borderColor: tokens.line,
            backgroundColor: tokens.cardBg,
          }}
        >
          <View className="flex-row items-center justify-between">
            <Text
              className="text-xs font-semibold uppercase tracking-wider"
              style={{ color: tokens.textSec }}
            >
              Metrics & observations
            </Text>
            <Ionicons
              name={metricsOpen ? "chevron-up" : "chevron-down"}
              size={16}
              color={tokens.textTer}
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
              <View
                className="rounded-2xl border p-4 mb-6"
                style={{
                  borderColor: tokens.line,
                  backgroundColor: tokens.cardBg,
                }}
              >
                <Text
                  className="text-xs font-semibold uppercase tracking-wider mb-4"
                  style={{ color: tokens.textTer }}
                >
                  Mood trend
                </Text>
                <View className="flex-row items-end gap-2" style={{ height: 120 }}>
                  {moodEntries.map((entry) => {
                    const score = entry.moodScore ?? 5;
                    const heightPct = (score / 10) * 100;
                    const color = moodToneColor(entry.mood, tokens);
                    const day = new Date(entry.createdAt).toLocaleDateString(
                      "en-US",
                      { weekday: "narrow" }
                    );
                    return (
                      <View
                        key={entry.id}
                        className="flex-1 items-center gap-1"
                      >
                        <Text
                          className="text-xs"
                          style={{ color: tokens.textTer }}
                        >
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
                        <Text
                          className="text-xs"
                          style={{ color: tokens.textTer }}
                        >
                          {day}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              </View>
            )}

            {memory && memory.totalEntries > 0 && (
              <View className="mb-6">
                <Text
                  className="text-xs"
                  style={{ color: tokens.textTer }}
                >
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
