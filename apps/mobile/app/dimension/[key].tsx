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

import { MoodIcon } from "@/components/mood-icon";

import { useTheme } from "@/contexts/theme-context";
import { api } from "@/lib/api";
import { getCached, isStale, setCached } from "@/lib/cache";

function dimensionKey(key: string): string {
  return `/api/lifemap/dimension/${encodeURIComponent(key)}`;
}

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
  const { tokens } = useTheme();

  const cacheKey = key ? dimensionKey(key) : null;
  const initialCached = cacheKey
    ? getCached<DimensionDetail>(cacheKey)
    : undefined;

  const [data, setData] = useState<DimensionDetail | null>(
    () => initialCached ?? null
  );
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(() => !initialCached);

  useEffect(() => {
    if (!key || !cacheKey) return;
    // Cache-hit render is instant; skip the fetch if the response is
    // still fresh (30s TTL). Otherwise revalidate silently in the
    // background — cached content stays painted during the round-trip.
    if (initialCached && !isStale(cacheKey)) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await api.get<DimensionDetail>(cacheKey);
        if (cancelled) return;
        setCached(cacheKey, res);
        setData(res);
      } catch (err) {
        if (!cancelled && !initialCached) {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, cacheKey]);

  // Q11d-3: dimension.color (server data color from DEFAULT_LIFE_AREAS
  // via /api/lifemap/dimension/[key]) no longer drives mobile chrome.
  // Uses tokens.primary for the active palette accent (header dot,
  // sparkline, "What's driving this" tint, goal progress fill,
  // reflection prompt button). Same convention as Q11a-1, Q11c-1,
  // Q11c-2, Q11c-3.
  return (
    <SafeAreaView
      className="flex-1"
      edges={["top"]}
      style={{ backgroundColor: tokens.bg }}
    >
      {/* Header with close button */}
      <View
        className="flex-row items-center justify-between px-5 pt-2 pb-3 border-b"
        style={{ borderColor: tokens.line }}
      >
        <View className="flex-row items-center gap-2">
          {data && (
            <>
              <View
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: 5,
                  backgroundColor: tokens.primary,
                }}
              />
              <Text
                className="text-base font-semibold"
                style={{ color: tokens.text }}
              >
                {data.dimension.name}
              </Text>
            </>
          )}
          {!data && loading && (
            <Text
              className="text-base font-semibold"
              style={{ color: tokens.textTer }}
            >
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
          <Ionicons name="close" size={22} color={tokens.textTer} />
        </Pressable>
      </View>

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={tokens.primary} />
        </View>
      ) : error ? (
        <View className="flex-1 items-center justify-center px-8">
          <Ionicons
            name="alert-circle-outline"
            size={48}
            color={tokens.textTer}
          />
          <Text
            className="text-sm mt-3 text-center"
            style={{ color: tokens.textSec }}
          >
            {error}
          </Text>
        </View>
      ) : data ? (
        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 60 }}>
          {/* Score hero */}
          <View className="mb-5">
            <View className="flex-row items-baseline gap-2">
              <Text
                className="text-5xl font-bold"
                style={{ color: tokens.text }}
              >
                {data.score}
              </Text>
              <Text
                className="text-base"
                style={{ color: tokens.textTer }}
              >
                /100
              </Text>
              <Text
                className="text-sm font-medium ml-2"
                style={{
                  color:
                    data.change > 0
                      ? tokens.good
                      : data.change < 0
                        ? tokens.bad
                        : tokens.textTer,
                }}
              >
                {data.change > 0 ? "+" : ""}
                {data.change} vs baseline
              </Text>
            </View>
          </View>

          {/* Trajectory sparkline */}
          {data.trajectory.length > 1 && (
            <View
              className="mb-6 rounded-2xl border p-4"
              style={{
                borderColor: tokens.line,
                backgroundColor: tokens.cardBg,
              }}
            >
              <Text
                className="text-xs font-semibold uppercase tracking-wider mb-3"
                style={{ color: tokens.textTer }}
              >
                Last 30 days
              </Text>
              <Sparkline
                points={data.trajectory.map((p) => p.score)}
                color={tokens.primary}
              />
            </View>
          )}

          {/* What's driving this */}
          <View
            className="mb-5 rounded-2xl p-4"
            style={{ backgroundColor: `${tokens.primary}15` }}
          >
            <Text
              className="text-xs font-semibold uppercase tracking-wider mb-2"
              style={{ color: tokens.primary }}
            >
              What's driving this
            </Text>
            <Text
              className="text-sm leading-relaxed"
              style={{ color: tokens.text }}
            >
              {data.whatsDriving}
            </Text>
          </View>

          {/* Top themes */}
          {data.topThemes.length > 0 && (
            <View className="mb-6">
              <Text
                className="text-xs font-semibold uppercase tracking-wider mb-2"
                style={{ color: tokens.textTer }}
              >
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
                          ? `${tokens.good}24`
                          : t.sentiment === "NEGATIVE"
                            ? `${tokens.bad}24`
                            : `${tokens.textTer}24`,
                    }}
                  >
                    <Text
                      className="text-xs"
                      style={{ color: tokens.textSec }}
                    >
                      {t.theme}
                    </Text>
                    {t.count > 0 && (
                      <Text
                        className="text-[10px]"
                        style={{ color: tokens.textTer }}
                      >
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
              <Text
                className="text-xs font-semibold uppercase tracking-wider mb-2"
                style={{ color: tokens.textTer }}
              >
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
                      className="rounded-2xl border p-3"
                      style={{
                        borderColor: tokens.line,
                        backgroundColor: tokens.cardBg,
                      }}
                    >
                      <View className="flex-row items-center gap-2 mb-1">
                        <MoodIcon
                          mood={e.mood ?? "NEUTRAL"}
                          size={14}
                          color={tokens.textTer}
                        />
                        <Text
                          className="text-xs"
                          style={{ color: tokens.textTer }}
                        >
                          {day}
                        </Text>
                      </View>
                      <Text
                        className="text-sm"
                        numberOfLines={2}
                        style={{ color: tokens.textSec }}
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
              <Text
                className="text-xs font-semibold uppercase tracking-wider mb-2"
                style={{ color: tokens.textTer }}
              >
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
                    className="rounded-2xl border p-3"
                    style={{
                      borderColor: tokens.line,
                      backgroundColor: tokens.cardBg,
                    }}
                  >
                    <Text
                      className="text-sm font-medium"
                      style={{ color: tokens.text }}
                    >
                      {g.title}
                    </Text>
                    <View className="flex-row items-center gap-2 mt-2">
                      <View
                        className="flex-1 h-1.5 rounded-full"
                        style={{ backgroundColor: tokens.bgInset }}
                      >
                        <View
                          className="h-full rounded-full"
                          style={{
                            width: `${g.progress}%`,
                            backgroundColor: tokens.primary,
                          }}
                        />
                      </View>
                      <Text
                        className="text-[10px] tabular-nums"
                        style={{ color: tokens.textTer }}
                      >
                        {g.progress}%
                      </Text>
                    </View>
                  </Pressable>
                ))}
              </View>
            </View>
          )}

          {/* Reflection prompt */}
          <View
            className="rounded-2xl border p-4"
            style={{
              borderColor: `${tokens.primary}55`,
              backgroundColor: `${tokens.primary}14`,
            }}
          >
            <Text
              className="text-xs font-semibold uppercase tracking-wider mb-2"
              style={{ color: tokens.primary }}
            >
              Worth reflecting on
            </Text>
            <Text
              className="text-base leading-relaxed mb-3"
              style={{ color: tokens.text }}
            >
              {data.reflectionPrompt}
            </Text>
            <Pressable
              onPress={() => {
                // Dismiss the dimension modal first, then open the
                // recorder with the dimension key in the URL so the
                // extraction pipeline gets Entry.dimensionContext set.
                router.back();
                router.push(
                  `/record?dimensionKey=${encodeURIComponent(data.dimension.key)}`
                );
              }}
              className="rounded-xl py-2.5 items-center"
              style={{ backgroundColor: tokens.primary }}
            >
              <Text
                className="text-sm font-semibold"
                style={{ color: "#FFFFFF" }}
              >
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
