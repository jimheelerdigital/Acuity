/**
 * Roadmap item detail (2026-10-19). Jimmy: "I want things that are shipped
 * to have detail pages so I can click on it, see what was released, and
 * learn more. Same for upcoming things." Mirrors goripple.io/roadmap/[id]:
 * banner, status + timing, why it matters, what it does / what shipped,
 * highlights, and (shipped) how to use it. Open items keep the vote here.
 */

import { Ionicons } from "@expo/vector-icons";
import { Stack, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { roadmapVotingOpen } from "@acuity/shared";

import { FeedbackModal } from "@/components/feedback-modal";
import {
  CategoryBanner,
  StatusPill,
  VoteButton,
  categoryLabel,
  contextLine,
  postVote,
  voteErrorMessage,
  type RoadmapDetail,
} from "@/components/roadmap/roadmap-ui";
import { useTheme } from "@/contexts/theme-context";
import { api } from "@/lib/api";

function headings(item: RoadmapDetail) {
  const shipped = item.status === "shipped";
  return {
    problem: "Why it matters",
    solution: shipped ? "What shipped" : item.status === "considering" ? "The idea" : "What we're building",
    highlights: shipped ? "What's included" : "What it will do",
    howTo: "How to use it",
  };
}

export default function RoadmapItemScreen() {
  const { tokens } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [item, setItem] = useState<RoadmapDetail | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "missing" | "error">("loading");
  const [busy, setBusy] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const res = await api.get<{ item: RoadmapDetail }>(`/api/roadmap/${encodeURIComponent(id)}`);
      setItem(res.item);
      setState("ready");
    } catch (err) {
      setState((err as { status?: number }).status === 404 ? "missing" : "error");
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggle = useCallback(async () => {
    if (!item || busy) return;
    setBusy(true);
    const before = item;
    setItem({ ...item, votedByMe: !item.votedByMe, votes: item.votes + (item.votedByMe ? -1 : 1) });
    try {
      const res = await postVote(item.id);
      setItem((cur) => (cur ? { ...cur, votedByMe: res.voted, votes: res.votes } : cur));
    } catch (err) {
      setItem(before);
      Alert.alert("Couldn't save your vote", voteErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }, [item, busy]);

  const body = { fontFamily: tokens.fontSans, fontSize: 16, lineHeight: 24, color: tokens.textSec } as const;
  const h2 = { fontFamily: tokens.fontSans, fontSize: 18, fontWeight: "700" as const, color: tokens.text };

  return (
    <SafeAreaView edges={["bottom"]} style={{ flex: 1, backgroundColor: tokens.bg }}>
      <Stack.Screen
        options={{
          headerShown: true,
          headerStyle: { backgroundColor: tokens.bg },
          headerTintColor: tokens.text,
          title: "",
          headerBackTitle: "Roadmap",
        }}
      />
      {state === "loading" ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator color={tokens.primary} />
        </View>
      ) : state !== "ready" || !item ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24, gap: 12 }}>
          <Text style={{ fontFamily: tokens.fontSans, fontSize: 15, color: tokens.textSec, textAlign: "center" }}>
            {state === "missing" ? "This item isn't on the roadmap any more." : "Couldn't load this. Check your connection."}
          </Text>
          {state === "error" ? (
            <Pressable onPress={() => void load()} accessibilityRole="button">
              <Text style={{ fontFamily: tokens.fontSans, fontSize: 15, fontWeight: "600", color: tokens.primary }}>Try again</Text>
            </Pressable>
          ) : null}
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 48 }}>
          <CategoryBanner category={item.category} height={140} radius={20} iconSize={48} roundBottom />

          <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8, marginTop: 20 }}>
            <StatusPill status={item.status} />
            {categoryLabel(item.category) ? (
              <Text style={{ fontFamily: tokens.fontSans, fontSize: 13, color: tokens.textTer }}>{categoryLabel(item.category)}</Text>
            ) : null}
          </View>
          {contextLine(item) ? (
            <Text
              style={{
                fontFamily: tokens.fontSans,
                fontSize: 13,
                fontWeight: "600",
                marginTop: 8,
                color: item.status === "shipped" ? tokens.good : tokens.textSec,
              }}
            >
              {contextLine(item)}
            </Text>
          ) : null}

          <Text style={{ fontFamily: tokens.fontDisplay, fontSize: 26, lineHeight: 32, fontWeight: "700", color: tokens.text, marginTop: 10 }}>
            {item.title}
          </Text>
          <Text style={{ ...body, fontSize: 17, lineHeight: 25, marginTop: 10 }}>{item.summary}</Text>

          {roadmapVotingOpen(item.status) ? (
            <View style={{ marginTop: 18, gap: 8 }}>
              <View style={{ alignSelf: "flex-start" }}>
                <VoteButton item={item} busy={busy} onPress={() => void toggle()} size="large" />
              </View>
              <Text style={{ fontFamily: tokens.fontSans, fontSize: 13, color: tokens.textTer }}>
                Votes change the order we build in.
              </Text>
            </View>
          ) : null}

          <View style={{ marginTop: 28, gap: 26 }}>
            {item.problem ? (
              <View>
                <Text style={h2}>{headings(item).problem}</Text>
                {item.problem.split(/\n{2,}/).map((p, i) => (
                  <Text key={i} style={{ ...body, marginTop: 8 }}>{p}</Text>
                ))}
              </View>
            ) : null}
            {item.solution ? (
              <View>
                <Text style={h2}>{headings(item).solution}</Text>
                {item.solution.split(/\n{2,}/).map((p, i) => (
                  <Text key={i} style={{ ...body, marginTop: 8 }}>{p}</Text>
                ))}
              </View>
            ) : null}
            {item.highlights.length > 0 ? (
              <View>
                <Text style={h2}>{headings(item).highlights}</Text>
                <View style={{ marginTop: 10, gap: 10 }}>
                  {item.highlights.map((line, i) => (
                    <View key={i} style={{ flexDirection: "row", gap: 10 }}>
                      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: tokens.primary, marginTop: 9 }} />
                      <Text style={{ ...body, flex: 1 }}>{line}</Text>
                    </View>
                  ))}
                </View>
              </View>
            ) : null}
            {item.howTo && item.status === "shipped" ? (
              <View style={{ borderRadius: 16, borderWidth: 1, borderColor: tokens.cardBorder, backgroundColor: tokens.cardBg, padding: 16 }}>
                <Text style={h2}>{headings(item).howTo}</Text>
                {item.howTo.split(/\n{2,}/).map((p, i) => (
                  <Text key={i} style={{ ...body, marginTop: 8 }}>{p}</Text>
                ))}
              </View>
            ) : null}
            {!item.hasDetails ? (
              <Text style={{ fontFamily: tokens.fontSans, fontSize: 14, color: tokens.textTer }}>More detail coming soon.</Text>
            ) : null}
          </View>

          <Pressable
            onPress={() => setShowFeedback(true)}
            accessibilityRole="button"
            style={{
              marginTop: 32,
              flexDirection: "row",
              alignItems: "center",
              gap: 12,
              borderRadius: 16,
              borderWidth: 1,
              borderColor: tokens.cardBorder,
              backgroundColor: tokens.cardBg,
              padding: 16,
            }}
          >
            <Ionicons name="bulb-outline" size={22} color={tokens.primary} />
            <Text style={{ flex: 1, fontFamily: tokens.fontSans, fontSize: 15, fontWeight: "600", color: tokens.text }}>
              Got a related idea? Tell us
            </Text>
            <Ionicons name="chevron-forward" size={18} color={tokens.textTer} />
          </Pressable>
        </ScrollView>
      )}
      <FeedbackModal visible={showFeedback} initialType="feature" onClose={() => setShowFeedback(false)} />
    </SafeAreaView>
  );
}
