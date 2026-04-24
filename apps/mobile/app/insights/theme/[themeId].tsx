import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { formatRelativeDate } from "@acuity/shared";

import { BackButton } from "@/components/back-button";
import { AreaChart } from "@/components/theme-detail/AreaChart";
import { InsightCard } from "@/components/theme-detail/InsightCard";
import { MentionCard } from "@/components/theme-detail/MentionCard";
import { RelatedChips } from "@/components/theme-detail/RelatedChips";
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
  relatedThemes: Array<{
    id: string;
    name: string;
    count: number;
    sentimentBand?: SentimentBand;
  }>;
  aiInsight: string | null;
};

const SENTIMENT_COLOR: Record<SentimentBand, string> = {
  positive: "#34D399",
  challenging: "#F87171",
  neutral: "#A78BFA",
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

  const xLabels = useMemo(() => {
    if (!data) return [];
    return buildXLabels(data.trend.length);
  }, [data]);

  if (loading) {
    return (
      <SafeAreaView
        edges={["top"]}
        style={{
          flex: 1,
          backgroundColor: "#0B0B12",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <ActivityIndicator color="#7C3AED" />
      </SafeAreaView>
    );
  }

  if (!data) {
    return (
      <SafeAreaView
        edges={["top"]}
        style={{
          flex: 1,
          backgroundColor: "#0B0B12",
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
        }}
      >
        <Text style={{ color: "rgba(161,161,170,0.8)" }}>Theme not found.</Text>
      </SafeAreaView>
    );
  }

  const { theme, trend, mentions, relatedThemes, aiInsight } = data;
  const color = SENTIMENT_COLOR[theme.sentimentBand];

  return (
    <SafeAreaView
      edges={["top"]}
      style={{ flex: 1, backgroundColor: "#0B0B12" }}
    >
      <ScrollView contentContainerStyle={{ paddingBottom: 48 }}>
        <View style={{ paddingHorizontal: 20, paddingTop: 8 }}>
          <BackButton onPress={() => router.back()} />
        </View>

        <View
          style={{ paddingHorizontal: 20, marginTop: 16, marginBottom: 24 }}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
              marginBottom: 10,
            }}
          >
            <View
              style={{
                width: 8,
                height: 8,
                borderRadius: 4,
                backgroundColor: color,
                shadowColor: color,
                shadowOpacity: theme.sentimentBand === "neutral" ? 0 : 0.8,
                shadowRadius: 4,
              }}
            />
            <Text
              style={{
                fontSize: 11,
                fontWeight: "700",
                letterSpacing: 1.4,
                textTransform: "uppercase",
                color: "rgba(161,161,170,0.75)",
              }}
            >
              {SENTIMENT_LABEL[theme.sentimentBand]} · {theme.mentionCount}{" "}
              mention{theme.mentionCount === 1 ? "" : "s"}
            </Text>
          </View>
          <Text
            style={{
              fontSize: 32,
              fontWeight: "700",
              letterSpacing: -0.8,
              lineHeight: 38,
              color: "#FAFAFA",
            }}
          >
            {sentenceCase(theme.name)}
          </Text>
          <Text
            style={{
              marginTop: 8,
              fontSize: 12,
              color: "rgba(161,161,170,0.7)",
            }}
          >
            First seen {formatRelativeDate(theme.firstMentionedAt)} · last{" "}
            {formatRelativeDate(theme.lastMentionedAt)}
          </Text>
        </View>

        {theme.mentionCount > 0 && (
          <View style={{ paddingHorizontal: 20, marginBottom: 28 }}>
            <Text
              style={{
                fontSize: 11,
                fontWeight: "700",
                letterSpacing: 1.4,
                textTransform: "uppercase",
                color: "rgba(161,161,170,0.6)",
                marginBottom: 12,
              }}
            >
              Last 30 days
            </Text>
            <AreaChart
              trend={trend}
              color={color}
              mentionCount={theme.mentionCount}
              xLabels={xLabels}
            />
          </View>
        )}

        {aiInsight && (
          <View style={{ paddingHorizontal: 20, marginBottom: 28 }}>
            <InsightCard text={aiInsight} />
          </View>
        )}

        <View style={{ paddingHorizontal: 20, marginBottom: 12 }}>
          <Text
            style={{
              fontSize: 11,
              fontWeight: "700",
              letterSpacing: 1.4,
              textTransform: "uppercase",
              color: "rgba(161,161,170,0.6)",
              marginBottom: 12,
            }}
          >
            All mentions
          </Text>
        </View>

        {mentions.length === 0 ? (
          <View style={{ paddingHorizontal: 20 }}>
            <Text style={{ fontSize: 13, color: "rgba(161,161,170,0.75)" }}>
              No mentions yet.
            </Text>
          </View>
        ) : (
          <View style={{ paddingHorizontal: 20, gap: 10 }}>
            {mentions.map((m) => (
              <MentionCard
                key={`${m.entryId}-${m.createdAt}`}
                summary={m.summary}
                mood={m.mood}
                createdAt={m.createdAt}
                onPress={() => router.push(`/entry/${m.entryId}` as never)}
              />
            ))}
          </View>
        )}

        {relatedThemes.length > 0 && (
          <View style={{ marginTop: 28 }}>
            <View style={{ paddingHorizontal: 20, marginBottom: 12 }}>
              <Text
                style={{
                  fontSize: 11,
                  fontWeight: "700",
                  letterSpacing: 1.4,
                  textTransform: "uppercase",
                  color: "rgba(161,161,170,0.6)",
                }}
              >
                Often appears alongside
              </Text>
            </View>
            <RelatedChips
              items={relatedThemes.map((r) => ({
                id: r.id,
                name: r.name,
                count: r.count,
                sentiment: r.sentimentBand,
              }))}
              onTap={(id) => router.push(`/insights/theme/${id}` as never)}
            />
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function sentenceCase(s: string): string {
  if (!s) return s;
  const lower = s.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

/**
 * Build 4 evenly-spaced x-axis labels for the 30-day trend window.
 * "30d ago", "20d", "10d", "Today". The parent passes the computed
 * array into <AreaChart>.
 */
function buildXLabels(length: number): string[] {
  if (length < 4) return [];
  return ["30d ago", "20d", "10d", "Today"];
}
