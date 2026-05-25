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

import { Avatar } from "@/components/acuity";
import { useTheme } from "@/contexts/theme-context";
import { api } from "@/lib/api";

/**
 * /insights/people/[id] — mobile parity for the web Person detail.
 * Slice 8 v1.2 Anchor People.
 *
 * Sentiment band + Care pattern are computed client-side from the
 * mention timeline (cheaper than another round-trip; the same logic
 * the web server-renders). Mention rows highlight the verbatim
 * mentionText inside the context snippet.
 *
 * Mobile defers the rename affordance to web for v1 — single edit
 * field on a small screen reads ambiguously next to the avatar +
 * counters, and rename is rare enough to not warrant native UI work.
 */

interface PersonDetail {
  id: string;
  displayName: string;
  mentionCount: number;
  firstMentionedAt: string;
}

interface MentionRow {
  id: string;
  mentionText: string;
  context: string;
  createdAt: string;
  entry: {
    id: string;
    createdAt: string;
    mood: string | null;
    themes: string[];
  };
}

interface ApiResponse {
  person: PersonDetail;
  mentions: MentionRow[];
}

interface MoodTally {
  positive: number;
  neutral: number;
  challenging: number;
}

const MOOD_BUCKETS: Record<string, keyof MoodTally> = {
  GREAT: "positive",
  GOOD: "positive",
  OK: "neutral",
  MEH: "neutral",
  ROUGH: "challenging",
  HARD: "challenging",
  AWFUL: "challenging",
};

function bucketMood(mood: string | null): keyof MoodTally | null {
  if (!mood) return null;
  return MOOD_BUCKETS[mood] ?? null;
}

function pctFor(part: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((part / total) * 100);
}

function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function formatTimelineDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export default function PersonDetailScreen() {
  const router = useRouter();
  const { tokens } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [data, setData] = useState<ApiResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    void api
      .get<ApiResponse>(`/api/people/${id}`)
      .then((res) => {
        if (cancelled) return;
        setData(res);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "fetch failed");
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (!data) {
    return (
      <SafeAreaView
        style={{ flex: 1, backgroundColor: tokens.bg }}
        edges={["top"]}
      >
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          {error ? (
            <Text
              style={{
                fontFamily: tokens.fontSans,
                fontSize: 14,
                color: tokens.textSec,
              }}
            >
              Couldn&apos;t load.
            </Text>
          ) : (
            <ActivityIndicator color={tokens.textSec} />
          )}
        </View>
      </SafeAreaView>
    );
  }

  const { person, mentions } = data;

  // Sentiment band
  const seenEntries = new Set<string>();
  const tally: MoodTally = { positive: 0, neutral: 0, challenging: 0 };
  for (const m of mentions) {
    if (seenEntries.has(m.entry.id)) continue;
    seenEntries.add(m.entry.id);
    const bucket = bucketMood(m.entry.mood);
    if (bucket) tally[bucket] += 1;
  }
  const totalMood = tally.positive + tally.neutral + tally.challenging;
  const showSentimentBand = totalMood >= 2;

  // Care pattern
  const recentCutoff = Date.now() - 30 * 86400_000;
  let recentCount = 0;
  const themeTally = new Map<string, number>();
  for (const m of mentions) {
    if (new Date(m.entry.createdAt).getTime() >= recentCutoff) {
      recentCount += 1;
      for (const t of m.entry.themes) {
        themeTally.set(t, (themeTally.get(t) ?? 0) + 1);
      }
    }
  }
  let topTheme: string | null = null;
  let topThemeCount = 0;
  for (const [theme, count] of themeTally.entries()) {
    if (count > topThemeCount) {
      topTheme = theme;
      topThemeCount = count;
    }
  }
  const showCarePattern = recentCount >= 2 && topTheme && topThemeCount >= 2;

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: tokens.bg }}
      edges={["top"]}
    >
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 14,
            marginBottom: 24,
          }}
        >
          <Avatar initials={initialsFor(person.displayName)} size={56} />
          <View style={{ flex: 1, gap: 4 }}>
            <Text
              style={{
                fontFamily: tokens.fontDisplay,
                fontSize: 24,
                fontWeight: "700",
                color: tokens.text,
              }}
              numberOfLines={1}
            >
              {person.displayName}
            </Text>
            <Text
              style={{
                fontFamily: tokens.fontSans,
                fontSize: 12,
                color: tokens.textTer,
              }}
            >
              Mentioned {person.mentionCount}{" "}
              {person.mentionCount === 1 ? "time" : "times"} since{" "}
              {formatDate(person.firstMentionedAt)}
            </Text>
          </View>
        </View>

        {showSentimentBand && (
          <View style={{ marginBottom: 24 }}>
            <Text
              style={{
                fontFamily: tokens.fontMono,
                fontSize: 10,
                fontWeight: "700",
                letterSpacing: 1.4,
                color: tokens.textTer,
                textTransform: "uppercase",
                marginBottom: 8,
              }}
            >
              When you mention them
            </Text>
            <View
              style={{
                flexDirection: "row",
                height: 8,
                borderRadius: 4,
                overflow: "hidden",
              }}
            >
              <View
                style={{
                  flex: pctFor(tally.positive, totalMood),
                  backgroundColor: tokens.good,
                }}
              />
              <View
                style={{
                  flex: pctFor(tally.neutral, totalMood),
                  backgroundColor: tokens.textTer,
                }}
              />
              <View
                style={{
                  flex: pctFor(tally.challenging, totalMood),
                  backgroundColor: tokens.bad,
                }}
              />
            </View>
            <Text
              style={{
                fontFamily: tokens.fontMono,
                fontSize: 10,
                color: tokens.textTer,
                marginTop: 6,
                textTransform: "uppercase",
                letterSpacing: 1.4,
              }}
            >
              {pctFor(tally.positive, totalMood)}% positive ·{" "}
              {pctFor(tally.neutral, totalMood)}% neutral ·{" "}
              {pctFor(tally.challenging, totalMood)}% challenging
            </Text>
          </View>
        )}

        {showCarePattern && topTheme && (
          <View
            style={{
              marginBottom: 24,
              borderRadius: tokens.radius.xl,
              backgroundColor: tokens.cardBg,
              borderWidth: 0.5,
              borderColor: tokens.cardBorder,
              padding: 20,
            }}
          >
            <Text
              style={{
                fontFamily: tokens.fontMono,
                fontSize: 10,
                fontWeight: "700",
                letterSpacing: 1.4,
                color: tokens.textTer,
                textTransform: "uppercase",
              }}
            >
              Pattern
            </Text>
            <Text
              style={{
                fontFamily: tokens.fontSans,
                fontSize: 14,
                lineHeight: 21,
                color: tokens.text,
                marginTop: 8,
              }}
            >
              You&apos;ve mentioned{" "}
              <Text style={{ fontWeight: "600" }}>{person.displayName}</Text>{" "}
              {recentCount} times this month. Mostly in the context of{" "}
              <Text style={{ fontWeight: "600" }}>{topTheme}</Text>.
            </Text>
          </View>
        )}

        <Text
          style={{
            fontFamily: tokens.fontMono,
            fontSize: 10,
            fontWeight: "700",
            letterSpacing: 1.4,
            color: tokens.textTer,
            textTransform: "uppercase",
            marginBottom: 10,
          }}
        >
          Timeline · {mentions.length}
        </Text>

        <View style={{ gap: 8 }}>
          {mentions.map((m) => {
            const idx = m.context.indexOf(m.mentionText);
            const before = idx === -1 ? m.context : m.context.slice(0, idx);
            const hit =
              idx === -1
                ? ""
                : m.context.slice(idx, idx + m.mentionText.length);
            const after =
              idx === -1 ? "" : m.context.slice(idx + m.mentionText.length);

            return (
              <Pressable
                key={m.id}
                onPress={() => router.push(`/entry/${m.entry.id}`)}
                style={{
                  borderRadius: tokens.radius.lg,
                  backgroundColor: tokens.cardBgTint,
                  borderWidth: 0.5,
                  borderColor: tokens.cardBorder,
                  paddingHorizontal: 16,
                  paddingVertical: 14,
                }}
              >
                <Text
                  style={{
                    fontFamily: tokens.fontMono,
                    fontSize: 10,
                    fontWeight: "700",
                    letterSpacing: 1.4,
                    color: tokens.textTer,
                    textTransform: "uppercase",
                  }}
                >
                  {formatTimelineDate(m.entry.createdAt)}
                </Text>
                <Text
                  style={{
                    fontFamily: tokens.fontSans,
                    fontSize: 14,
                    lineHeight: 21,
                    color: tokens.textSec,
                    marginTop: 4,
                  }}
                >
                  …{before}
                  <Text style={{ fontWeight: "700", color: tokens.text }}>
                    {hit}
                  </Text>
                  {after}…
                </Text>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
