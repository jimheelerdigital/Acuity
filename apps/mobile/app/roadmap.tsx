/**
 * Profile → Roadmap (2026-10-18). Native view of the public roadmap at
 * goripple.io/roadmap: Building now / Considering / Shipped, with upvotes.
 * Same API as the web page (GET /api/roadmap, POST /api/roadmap/:id/vote),
 * authenticated with the app's bearer so voting needs no web sign-in.
 * "Suggest an idea" opens the existing feedback modal (type = feature) —
 * ideas land in the same Slack funnel as bugs.
 */

import { Ionicons } from "@expo/vector-icons";
import { Stack } from "expo-router";
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

import { FeedbackModal } from "@/components/feedback-modal";
import { useTheme } from "@/contexts/theme-context";
import { api } from "@/lib/api";

type Status = "building" | "considering" | "shipped";
type Item = {
  id: string;
  title: string;
  summary: string;
  status: Status;
  votes: number;
  votedByMe: boolean;
  shippedVersion: string | null;
};

const SECTIONS: Array<{ status: Status; title: string; blurb: string }> = [
  { status: "building", title: "Building now", blurb: "Landing in the next release or two." },
  { status: "considering", title: "Considering", blurb: "Your votes decide what moves up." },
  { status: "shipped", title: "Shipped", blurb: "Already in the app." },
];

export default function RoadmapScreen() {
  const { tokens } = useTheme();
  const [items, setItems] = useState<Item[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [showFeedback, setShowFeedback] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api.get<{ items: Item[] }>("/api/roadmap");
      setItems(res.items);
    } catch {
      if (items === null) setItems([]);
    }
  }, [items]);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggle = useCallback(
    async (id: string) => {
      if (busyId || !items) return;
      setBusyId(id);
      const before = items;
      setItems(
        items.map((it) =>
          it.id === id
            ? { ...it, votedByMe: !it.votedByMe, votes: it.votes + (it.votedByMe ? -1 : 1) }
            : it
        )
      );
      try {
        const res = await api.post<{ voted: boolean; votes: number }>(`/api/roadmap/${id}/vote`, {});
        setItems((cur) =>
          (cur ?? []).map((it) => (it.id === id ? { ...it, votedByMe: res.voted, votes: res.votes } : it))
        );
      } catch (err) {
        setItems(before);
        const status = (err as { status?: number }).status;
        Alert.alert(
          "Couldn't save your vote",
          status === 429 ? "Slow down a little — try again in a bit." : "Check your connection and try again."
        );
      } finally {
        setBusyId(null);
      }
    },
    [busyId, items]
  );

  return (
    <SafeAreaView edges={["bottom"]} style={{ flex: 1, backgroundColor: tokens.bg }}>
      <Stack.Screen
        options={{
          headerShown: true,
          headerStyle: { backgroundColor: tokens.bg },
          headerTintColor: tokens.text,
          title: "Roadmap",
          headerTitleStyle: { fontFamily: tokens.fontSans, fontWeight: "600" },
        }}
      />
      {items === null ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator color={tokens.primary} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 24 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                void load().finally(() => setRefreshing(false));
              }}
              tintColor={tokens.textSec}
            />
          }
        >
          <Text style={{ fontFamily: tokens.fontSans, fontSize: 14, lineHeight: 21, color: tokens.textSec }}>
            What we&rsquo;re building, what we&rsquo;re weighing up, and what just shipped. Upvote what would
            make Ripple better for you — it changes the order we build in.
          </Text>

          {SECTIONS.map((sec) => {
            const rows = items.filter((it) => it.status === sec.status);
            return (
              <View key={sec.status} style={{ gap: 10 }}>
                <View>
                  <Text style={{ fontFamily: tokens.fontSans, fontSize: 17, fontWeight: "700", color: tokens.text }}>
                    {sec.title}
                  </Text>
                  <Text style={{ fontFamily: tokens.fontSans, fontSize: 13, color: tokens.textTer, marginTop: 2 }}>
                    {sec.blurb}
                  </Text>
                </View>
                {rows.length === 0 ? (
                  <View
                    style={{
                      borderRadius: 16,
                      borderWidth: 1,
                      borderStyle: "dashed",
                      borderColor: tokens.cardBorder,
                      padding: 16,
                    }}
                  >
                    <Text style={{ fontFamily: tokens.fontSans, fontSize: 13, color: tokens.textTer }}>
                      Nothing here right now.
                    </Text>
                  </View>
                ) : null}
                {rows.map((it) => (
                  <View
                    key={it.id}
                    style={{
                      flexDirection: "row",
                      gap: 12,
                      borderRadius: 16,
                      borderWidth: 1,
                      borderColor: tokens.cardBorder,
                      backgroundColor: tokens.cardBg,
                      padding: 14,
                    }}
                  >
                    <View style={{ flex: 1, gap: 4 }}>
                      <Text style={{ fontFamily: tokens.fontSans, fontSize: 15, fontWeight: "600", color: tokens.text }}>
                        {it.title}
                      </Text>
                      <Text style={{ fontFamily: tokens.fontSans, fontSize: 13, lineHeight: 19, color: tokens.textSec }}>
                        {it.summary}
                      </Text>
                      {it.status === "shipped" && it.shippedVersion ? (
                        <Text style={{ fontFamily: tokens.fontSans, fontSize: 12, fontWeight: "600", color: tokens.good }}>
                          Shipped in {it.shippedVersion}
                        </Text>
                      ) : null}
                    </View>
                    {it.status !== "shipped" ? (
                      <Pressable
                        onPress={() => void toggle(it.id)}
                        disabled={busyId === it.id}
                        accessibilityRole="button"
                        accessibilityState={{ selected: it.votedByMe }}
                        accessibilityLabel={`${it.votedByMe ? "Remove vote for" : "Vote for"} ${it.title}`}
                        hitSlop={6}
                        style={{
                          width: 48,
                          height: 56,
                          borderRadius: 12,
                          borderWidth: 1,
                          alignItems: "center",
                          justifyContent: "center",
                          borderColor: it.votedByMe ? tokens.primary : tokens.cardBorder,
                          backgroundColor: it.votedByMe ? `${tokens.primary}22` : "transparent",
                          opacity: busyId === it.id ? 0.6 : 1,
                        }}
                      >
                        <Ionicons
                          name="caret-up"
                          size={16}
                          color={it.votedByMe ? tokens.primary : tokens.textSec}
                        />
                        <Text
                          style={{
                            fontFamily: tokens.fontSans,
                            fontSize: 13,
                            fontWeight: "700",
                            color: it.votedByMe ? tokens.primary : tokens.textSec,
                            fontVariant: ["tabular-nums"],
                          }}
                        >
                          {it.votes}
                        </Text>
                      </Pressable>
                    ) : null}
                  </View>
                ))}
              </View>
            );
          })}

          <Pressable
            onPress={() => setShowFeedback(true)}
            accessibilityRole="button"
            style={{
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
            <Ionicons name="bulb-outline" size={20} color={tokens.textSec} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: tokens.fontSans, fontSize: 15, fontWeight: "600", color: tokens.text }}>
                Have an idea?
              </Text>
              <Text style={{ fontFamily: tokens.fontSans, fontSize: 13, color: tokens.textTer, marginTop: 2 }}>
                Tell us what would make Ripple more useful. The good ones end up here.
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={tokens.textTer} />
          </Pressable>
        </ScrollView>
      )}
      <FeedbackModal
        visible={showFeedback}
        initialType="feature"
        onClose={() => setShowFeedback(false)}
      />
    </SafeAreaView>
  );
}
