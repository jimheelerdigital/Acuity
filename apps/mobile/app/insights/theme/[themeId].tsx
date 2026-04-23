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
import Svg, { Circle, Polyline } from "react-native-svg";

import { formatRelativeDate, MOOD_LABELS } from "@acuity/shared";

import { api } from "@/lib/api";

type SentimentBand = "positive" | "neutral" | "challenging";

type ThemeDetail = {
  theme: {
    id: string;
    name: string;
    sentimentBand: SentimentBand;
    mentionCount: number;
    firstMentionedAt: string;
    lastMentionedAt: string;
  };
  trend: number[];
  mentions: Array<{
    entryId: string;
    summary: string | null;
    mood: string | null;
    sentiment: string;
    createdAt: string;
  }>;
  relatedThemes: Array<{ id: string; name: string; count: number }>;
  aiInsight: string | null;
};

const SENTIMENT_COLOR: Record<SentimentBand, string> = {
  positive: "#34D399",
  challenging: "#F87171",
  neutral: "#94a3b8",
};

const SENTIMENT_LABEL: Record<SentimentBand, string> = {
  positive: "Positive",
  neutral: "Neutral",
  challenging: "Challenging",
};

export default function ThemeDetailScreen() {
  const { themeId } = useLocalSearchParams<{ themeId: string }>();
  const router = useRouter();
  const [data, setData] = useState<ThemeDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!themeId) return;
    api
      .get<ThemeDetail>(`/api/insights/theme/${encodeURIComponent(themeId)}`)
      .then((d) => setData(d))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [themeId]);

  if (loading) {
    return (
      <SafeAreaView
        edges={["top"]}
        className="flex-1 bg-white dark:bg-[#0B0B12] items-center justify-center"
      >
        <ActivityIndicator color="#7C3AED" />
      </SafeAreaView>
    );
  }

  if (!data) {
    return (
      <SafeAreaView
        edges={["top"]}
        className="flex-1 bg-white dark:bg-[#0B0B12] items-center justify-center p-6"
      >
        <Text className="text-zinc-500 dark:text-zinc-400">
          Theme not found.
        </Text>
      </SafeAreaView>
    );
  }

  const { theme, trend, mentions, relatedThemes, aiInsight } = data;
  const color = SENTIMENT_COLOR[theme.sentimentBand];

  return (
    <SafeAreaView edges={["top"]} className="flex-1 bg-white dark:bg-[#0B0B12]">
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 48 }}>
        <Pressable onPress={() => router.back()} hitSlop={8} className="mb-4">
          <Text className="text-sm text-zinc-500 dark:text-zinc-400">
            ← Theme Map
          </Text>
        </Pressable>

        <View className="mb-8">
          <View className="flex-row items-center gap-2 mb-2">
            <View
              style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: color }}
            />
            <Text className="text-xs font-semibold uppercase tracking-widest text-zinc-500 dark:text-zinc-400">
              {SENTIMENT_LABEL[theme.sentimentBand]} · {theme.mentionCount}{" "}
              mention{theme.mentionCount === 1 ? "" : "s"}
            </Text>
          </View>
          <Text
            className="text-3xl font-semibold uppercase tracking-tight text-zinc-900 dark:text-zinc-50"
            style={{ letterSpacing: -0.5 }}
          >
            {theme.name}
          </Text>
          <Text className="mt-2 text-xs text-zinc-400 dark:text-zinc-500">
            First seen {formatRelativeDate(theme.firstMentionedAt)} · last{" "}
            {formatRelativeDate(theme.lastMentionedAt)}
          </Text>
        </View>

        {theme.mentionCount > 0 && (
          <View className="mb-8">
            <Text className="mb-3 text-xs font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">
              Last 30 days
            </Text>
            <TrendChart trend={trend} color={color} />
          </View>
        )}

        {aiInsight && (
          <View className="mb-8 rounded-2xl border border-violet-200 dark:border-violet-900/30 bg-violet-50/40 dark:bg-violet-950/20 p-4">
            <Text className="text-xs font-semibold uppercase tracking-widest text-violet-700 dark:text-violet-300">
              What Acuity notices
            </Text>
            <Text className="mt-2 text-sm leading-relaxed text-zinc-700 dark:text-zinc-200">
              {aiInsight}
            </Text>
          </View>
        )}

        <View className="mb-8">
          <Text className="mb-3 text-xs font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">
            All mentions
          </Text>
          {mentions.length === 0 ? (
            <Text className="text-sm text-zinc-500 dark:text-zinc-400">
              No mentions yet.
            </Text>
          ) : (
            <View className="gap-2">
              {mentions.map((m) => (
                <Pressable
                  key={`${m.entryId}-${m.createdAt}`}
                  onPress={() =>
                    router.push(`/entry/${m.entryId}` as never)
                  }
                  className="rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#1E1E2E] px-4 py-3"
                >
                  <View className="flex-row items-center justify-between">
                    <Text className="text-xs text-zinc-500 dark:text-zinc-400">
                      {formatRelativeDate(m.createdAt)}
                    </Text>
                    {m.mood && (
                      <Text className="text-xs text-zinc-500 dark:text-zinc-400">
                        {MOOD_LABELS[m.mood] ?? m.mood}
                      </Text>
                    )}
                  </View>
                  <Text
                    className="mt-1 text-sm text-zinc-700 dark:text-zinc-200"
                    numberOfLines={2}
                  >
                    {m.summary ?? "(no summary)"}
                  </Text>
                </Pressable>
              ))}
            </View>
          )}
        </View>

        {relatedThemes.length > 0 && (
          <View className="mb-8">
            <Text className="mb-3 text-xs font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">
              Often appears alongside
            </Text>
            <View className="flex-row flex-wrap gap-2">
              {relatedThemes.map((r) => (
                <Pressable
                  key={r.id}
                  onPress={() =>
                    router.push(`/insights/theme/${r.id}` as never)
                  }
                  className="rounded-full border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#1E1E2E] px-3 py-1.5"
                >
                  <Text className="text-xs font-medium uppercase tracking-wider text-zinc-700 dark:text-zinc-200">
                    {r.name}{" "}
                    <Text className="text-zinc-400 dark:text-zinc-500 normal-case tracking-normal">
                      × {r.count}
                    </Text>
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function TrendChart({ trend, color }: { trend: number[]; color: string }) {
  const total = trend.reduce((a, b) => a + b, 0);
  if (total === 0) {
    return (
      <Text className="text-sm text-zinc-500 dark:text-zinc-400">
        No mentions in the last 30 days.
      </Text>
    );
  }
  const w = 600;
  const h = 90;
  const nonZero = trend.filter((v) => v > 0).length;

  return (
    <View className="rounded-xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#1E1E2E] p-4">
      <Svg
        viewBox={`0 0 ${w} ${h}`}
        preserveAspectRatio="none"
        width="100%"
        height={90}
      >
        {nonZero === 1
          ? (() => {
              const idx = trend.findIndex((v) => v > 0);
              const cx = (idx / (trend.length - 1)) * w;
              return <Circle cx={cx} cy={h / 2} r={6} fill={color} />;
            })()
          : (() => {
              const max = Math.max(...trend, 1);
              const stepX = w / (trend.length - 1);
              const pts = trend.map((v, i) => ({
                x: i * stepX,
                y: h - (v / max) * (h - 8) - 4,
              }));
              const line = pts.map((p) => `${p.x},${p.y}`).join(" ");
              return (
                <Polyline
                  points={line}
                  fill="none"
                  stroke={color}
                  strokeWidth={1.8}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              );
            })()}
      </Svg>
    </View>
  );
}
