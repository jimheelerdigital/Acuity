import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { MOOD_EMOJI } from "@acuity/shared";

import { useTheme } from "@/contexts/theme-context";
import { api } from "@/lib/api";

type DimensionDetail = {
  dimension: {
    key: string;
    name: string;
    enum: string;
    icon: string;
    color: string;
  };
  score: number;
  baseline: number;
  change: number;
  trajectory: { date: string; score: number }[];
  whatsDriving: string;
  topThemes: { theme: string; count: number; sentiment: string }[];
  recentEntries: {
    id: string;
    createdAt: string;
    mood: string | null;
    excerpt: string;
  }[];
  relatedGoals: {
    id: string;
    title: string;
    status: string;
    progress: number;
  }[];
  reflectionPrompt: string;
};

/**
 * Full-screen drill-down for one Life Matrix dimension. Presented as
 * an Expo Router modal (declared in app/_layout.tsx as
 * `presentation: "modal"`). Dismissed via the X button or iOS native
 * swipe-down gesture on the modal sheet.
 */
export default function DimensionDetailScreen() {
  const router = useRouter();
  const { key } = useLocalSearchParams<{ key: string }>();
  const { resolved } = useTheme();
  const isDark = resolved === "dark";

  const [data, setData] = useState<DimensionDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await api.get<DimensionDetail>(
          `/api/lifemap/dimension/${encodeURIComponent(key)}`
        );
        if (!cancelled) setData(res);
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : "Couldn't load this dimension right now."
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [key]);

  return (
    <SafeAreaView
      className="flex-1 bg-[#FAFAF7] dark:bg-[#0B0B12]"
      edges={["top"]}
    >
      {/* Header with close button */}
      <View className="flex-row items-center justify-between px-5 pt-2 pb-3 border-b border-zinc-100 dark:border-white/5">
        <View className="flex-row items-center gap-2">
          {data && (
            <>
              <View
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: 5,
                  backgroundColor: data.dimension.color,
                }}
              />
              <Text className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
                {data.dimension.name}
              </Text>
            </>
          )}
          {!data && loading && (
            <Text className="text-base font-semibold text-zinc-400 dark:text-zinc-500">
              Loading…
            </Text>
          )}
        </View>
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Close"
          className="rounded-full p-1.5"
        >
          <Ionicons name="close" size={22} color={isDark ? "#A1A1AA" : "#71717A"} />
        </Pressable>
      </View>

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#7C3AED" />
        </View>
      ) : error ? (
        <View className="flex-1 items-center justify-center px-8">
          <Ionicons name="alert-circle-outline" size={48} color="#A1A1AA" />
          <Text className="text-sm text-zinc-500 dark:text-zinc-400 mt-3 text-center">
            {error}
          </Text>
        </View>
      ) : data ? (
        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 60 }}>
          {/* Score hero */}
          <View className="mb-5">
            <View className="flex-row items-baseline gap-2">
              <Text className="text-5xl font-bold text-zinc-900 dark:text-zinc-50">
                {data.score}
              </Text>
              <Text className="text-base text-zinc-400 dark:text-zinc-500">
                /100
              </Text>
              <Text
                className={`text-sm font-medium ml-2 ${
                  data.change > 0
                    ? "text-emerald-600"
                    : data.change < 0
                      ? "text-red-500"
                      : "text-zinc-400 dark:text-zinc-500"
                }`}
              >
                {data.change > 0 ? "+" : ""}
                {data.change} vs baseline
              </Text>
            </View>
          </View>

          {/* Trajectory sparkline */}
          {data.trajectory.length > 1 && (
            <View className="mb-6 rounded-2xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#1E1E2E] p-4">
              <Text className="text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mb-3">
                Last 30 days
              </Text>
              <Sparkline
                points={data.trajectory.map((p) => p.score)}
                color={data.dimension.color}
              />
            </View>
          )}

          {/* What's driving this */}
          <View
            className="mb-5 rounded-2xl p-4"
            style={{ backgroundColor: data.dimension.color + "15" }}
          >
            <Text
              className="text-xs font-semibold uppercase tracking-wider mb-2"
              style={{ color: data.dimension.color }}
            >
              What's driving this
            </Text>
            <Text className="text-sm leading-relaxed text-zinc-800 dark:text-zinc-100">
              {data.whatsDriving}
            </Text>
          </View>

          {/* Top themes */}
          {data.topThemes.length > 0 && (
            <View className="mb-6">
              <Text className="text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mb-2">
                Top themes
              </Text>
              <View className="flex-row flex-wrap gap-1.5">
                {data.topThemes.map((t) => (
                  <View
                    key={t.theme}
                    className="rounded-full px-3 py-1 flex-row items-center gap-1.5"
                    style={{
                      backgroundColor:
                        t.sentiment === "POSITIVE"
                          ? "rgba(34,197,94,0.14)"
                          : t.sentiment === "NEGATIVE"
                            ? "rgba(239,68,68,0.14)"
                            : "rgba(161,161,170,0.14)",
                    }}
                  >
                    <Text className="text-xs text-zinc-700 dark:text-zinc-200">
                      {t.theme}
                    </Text>
                    {t.count > 0 && (
                      <Text className="text-[10px] text-zinc-400 dark:text-zinc-500">
                        {t.count}
                      </Text>
                    )}
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* Recent entries */}
          {data.recentEntries.length > 0 && (
            <View className="mb-6">
              <Text className="text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mb-2">
                Recent entries
              </Text>
              <View className="gap-2">
                {data.recentEntries.map((e) => {
                  const when = new Date(e.createdAt);
                  const day = when.toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                  });
                  return (
                    <Pressable
                      key={e.id}
                      onPress={() => {
                        router.back();
                        router.push(`/entry/${e.id}`);
                      }}
                      className="rounded-2xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#1E1E2E] p-3"
                    >
                      <View className="flex-row items-center gap-2 mb-1">
                        <Text style={{ fontSize: 16 }}>
                          {MOOD_EMOJI[e.mood ?? "NEUTRAL"] ?? "•"}
                        </Text>
                        <Text className="text-xs text-zinc-400 dark:text-zinc-500">
                          {day}
                        </Text>
                      </View>
                      <Text
                        className="text-sm text-zinc-700 dark:text-zinc-200"
                        numberOfLines={2}
                      >
                        {e.excerpt || "(no summary yet)"}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          )}

          {/* Related goals */}
          {data.relatedGoals.length > 0 && (
            <View className="mb-6">
              <Text className="text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mb-2">
                Goals in this area
              </Text>
              <View className="gap-2">
                {data.relatedGoals.map((g) => (
                  <Pressable
                    key={g.id}
                    onPress={() => {
                      router.back();
                      router.push(`/goal/${g.id}`);
                    }}
                    className="rounded-2xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#1E1E2E] p-3"
                  >
                    <Text className="text-sm font-medium text-zinc-800 dark:text-zinc-100">
                      {g.title}
                    </Text>
                    <View className="flex-row items-center gap-2 mt-2">
                      <View className="flex-1 h-1.5 rounded-full bg-zinc-100 dark:bg-white/10">
                        <View
                          className="h-full rounded-full"
                          style={{
                            width: `${g.progress}%`,
                            backgroundColor: data.dimension.color,
                          }}
                        />
                      </View>
                      <Text className="text-[10px] text-zinc-400 dark:text-zinc-500 tabular-nums">
                        {g.progress}%
                      </Text>
                    </View>
                  </Pressable>
                ))}
              </View>
            </View>
          )}

          {/* Reflection prompt */}
          <View className="rounded-2xl border border-violet-500/30 bg-violet-50 dark:bg-violet-950/20 p-4">
            <Text className="text-xs font-semibold uppercase tracking-wider text-violet-600 dark:text-violet-400 mb-2">
              Worth reflecting on
            </Text>
            <Text className="text-base leading-relaxed text-zinc-900 dark:text-zinc-50 mb-3">
              {data.reflectionPrompt}
            </Text>
            <Pressable
              onPress={() => {
                router.back();
                router.push("/record");
              }}
              className="rounded-xl bg-violet-600 py-2.5 items-center"
              style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1 })}
            >
              <Text className="text-sm font-semibold text-white">
                Record about this
              </Text>
            </Pressable>
          </View>
        </ScrollView>
      ) : null}
    </SafeAreaView>
  );
}

/**
 * Minimal SVG-free sparkline. Uses nested <View> bars where each bar
 * height maps to that day's score. Lightweight, no react-native-svg
 * dependency needed for this one chart.
 */
function Sparkline({ points, color }: { points: number[]; color: string }) {
  if (points.length === 0) return null;
  const max = Math.max(...points, 1);
  const min = Math.min(...points, 0);
  const range = Math.max(max - min, 1);

  return (
    <View className="flex-row items-end gap-0.5" style={{ height: 48 }}>
      {points.map((score, i) => {
        const normalized = (score - min) / range; // 0..1
        const height = 8 + normalized * 40;
        return (
          <View
            key={i}
            style={{
              flex: 1,
              height,
              backgroundColor: color,
              opacity: 0.35 + normalized * 0.65,
              borderRadius: 2,
            }}
          />
        );
      })}
    </View>
  );
}
