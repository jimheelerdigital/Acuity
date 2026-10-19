/**
 * Profile → Roadmap (2026-10-18; redesigned 2026-10-19). Native view of
 * goripple.io/roadmap. Jimmy, 10/19: "this whole roadmap screen needs to
 * be better... things that are shipped [should] have detail pages... same
 * for upcoming things. Voting is good." Reference: the LeanIX roadmap.
 *
 *   - Status tabs: Building / Planned / Vote / Shipped (@acuity/shared).
 *   - Cards with a category banner; tap opens /roadmap/[id].
 *   - Voting stays on the card (and on the detail page).
 *   - "Have an idea?" opens the feedback modal (type = feature).
 *
 * Same API as the web (GET /api/roadmap, POST /api/roadmap/:id/vote),
 * authenticated with the app's bearer. Items with a status this build
 * doesn't know are hidden rather than crashing.
 */

import { Ionicons } from "@expo/vector-icons";
import { Stack, useFocusEffect, useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
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

import { ROADMAP_STATUS_META, isRoadmapStatus, roadmapVotingOpen, type RoadmapStatus } from "@acuity/shared";

import { FeedbackModal } from "@/components/feedback-modal";
import {
  CategoryBanner,
  StatusPill,
  VoteButton,
  categoryLabel,
  contextLine,
  postVote,
  voteErrorMessage,
  type RoadmapCard,
} from "@/components/roadmap/roadmap-ui";
import { useTheme } from "@/contexts/theme-context";
import { api } from "@/lib/api";

const TABS: RoadmapStatus[] = ["building", "planned", "considering", "shipped"];

export default function RoadmapScreen() {
  const { tokens } = useTheme();
  const router = useRouter();
  const [items, setItems] = useState<RoadmapCard[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [tab, setTab] = useState<RoadmapStatus | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [showFeedback, setShowFeedback] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api.get<{ items: RoadmapCard[] }>("/api/roadmap");
      setItems(res.items.filter((it) => isRoadmapStatus(it.status)));
      setFailed(false);
    } catch {
      setFailed(true);
      setItems((cur) => cur ?? []);
    }
  }, []);

  // Reload on every focus so a vote cast on the detail screen shows here.
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const counts = useMemo(() => {
    const c: Record<RoadmapStatus, number> = { building: 0, planned: 0, considering: 0, shipped: 0 };
    for (const it of items ?? []) c[it.status] += 1;
    return c;
  }, [items]);
  // First visit: open the first tab with something in it.
  const activeTab: RoadmapStatus = tab ?? TABS.find((t) => counts[t] > 0) ?? "building";
  const rows = (items ?? []).filter((it) => it.status === activeTab);

  const toggle = useCallback(
    async (id: string) => {
      if (busyId || !items) return;
      setBusyId(id);
      const before = items;
      setItems(
        items.map((it) =>
          it.id === id ? { ...it, votedByMe: !it.votedByMe, votes: it.votes + (it.votedByMe ? -1 : 1) } : it
        )
      );
      try {
        const res = await postVote(id);
        setItems((cur) => (cur ?? []).map((it) => (it.id === id ? { ...it, votedByMe: res.voted, votes: res.votes } : it)));
      } catch (err) {
        setItems(before);
        Alert.alert("Couldn't save your vote", voteErrorMessage(err));
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
          contentContainerStyle={{ paddingBottom: 40 }}
          stickyHeaderIndices={[1]}
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
          <Text
            style={{
              fontFamily: tokens.fontSans,
              fontSize: 14,
              lineHeight: 21,
              color: tokens.textSec,
              paddingHorizontal: 16,
              paddingTop: 12,
            }}
          >
            What we&rsquo;re building, what&rsquo;s next, and what just shipped. Tap anything to learn more, and
            vote for what would make Ripple better for you.
          </Text>

          {/* Tabs — sticky so they stay reachable on a long list. */}
          <View style={{ backgroundColor: tokens.bg, paddingVertical: 12 }}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}>
              {TABS.map((t) => {
                const active = t === activeTab;
                return (
                  <Pressable
                    key={t}
                    onPress={() => setTab(t)}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: active }}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 6,
                      borderRadius: 999,
                      borderWidth: 1,
                      paddingHorizontal: 14,
                      paddingVertical: 8,
                      borderColor: active ? tokens.primary : tokens.cardBorder,
                      backgroundColor: active ? tokens.primary : "transparent",
                    }}
                  >
                    <Text style={{ fontFamily: tokens.fontSans, fontSize: 14, fontWeight: "700", color: active ? "#FFFFFF" : tokens.textSec }}>
                      {ROADMAP_STATUS_META[t].tab}
                    </Text>
                    <Text
                      style={{
                        fontFamily: tokens.fontSans,
                        fontSize: 13,
                        fontWeight: "600",
                        color: active ? "rgba(255,255,255,0.8)" : tokens.textTer,
                        fontVariant: ["tabular-nums"],
                      }}
                    >
                      {counts[t]}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>

          <View style={{ paddingHorizontal: 16, gap: 14 }}>
            <Text style={{ fontFamily: tokens.fontSans, fontSize: 13, color: tokens.textTer }}>
              {ROADMAP_STATUS_META[activeTab].blurb}
            </Text>

            {failed && rows.length === 0 ? (
              <Text style={{ fontFamily: tokens.fontSans, fontSize: 14, color: tokens.textSec }}>
                Couldn&rsquo;t load the roadmap. Pull down to try again.
              </Text>
            ) : rows.length === 0 ? (
              <View style={{ borderRadius: 16, borderWidth: 1, borderStyle: "dashed", borderColor: tokens.cardBorder, padding: 16 }}>
                <Text style={{ fontFamily: tokens.fontSans, fontSize: 13, color: tokens.textTer }}>Nothing here right now.</Text>
              </View>
            ) : null}

            {rows.map((it) => (
              <Card
                key={it.id}
                item={it}
                busy={busyId === it.id}
                onOpen={() => router.push(`/roadmap/${it.id}` as never)}
                onVote={() => void toggle(it.id)}
              />
            ))}

            <Pressable
              onPress={() => setShowFeedback(true)}
              accessibilityRole="button"
              style={{
                marginTop: 10,
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
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: tokens.fontSans, fontSize: 15, fontWeight: "600", color: tokens.text }}>Have an idea?</Text>
                <Text style={{ fontFamily: tokens.fontSans, fontSize: 13, color: tokens.textTer, marginTop: 2 }}>
                  Tell us what would make Ripple more useful. The good ones end up here.
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={tokens.textTer} />
            </Pressable>
          </View>
        </ScrollView>
      )}
      <FeedbackModal visible={showFeedback} initialType="feature" onClose={() => setShowFeedback(false)} />
    </SafeAreaView>
  );
}

function Card({
  item,
  busy,
  onOpen,
  onVote,
}: {
  item: RoadmapCard;
  busy: boolean;
  onOpen: () => void;
  onVote: () => void;
}) {
  const { tokens } = useTheme();
  const context = contextLine(item);
  const cat = categoryLabel(item.category);
  return (
    <Pressable
      onPress={onOpen}
      accessibilityRole="button"
      accessibilityLabel={`${item.title}. ${item.status === "shipped" ? "See what changed" : "Learn more"}`}
      style={({ pressed }) => ({
        borderRadius: 16,
        borderWidth: 1,
        borderColor: tokens.cardBorder,
        backgroundColor: tokens.cardBg,
        overflow: "hidden",
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <CategoryBanner category={item.category} radius={15} />
      <View style={{ padding: 14, gap: 6 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <StatusPill status={item.status} />
          {cat ? <Text style={{ fontFamily: tokens.fontSans, fontSize: 12, color: tokens.textTer }}>{cat}</Text> : null}
        </View>
        <Text style={{ fontFamily: tokens.fontSans, fontSize: 16, fontWeight: "700", color: tokens.text, marginTop: 2 }}>
          {item.title}
        </Text>
        <Text numberOfLines={3} style={{ fontFamily: tokens.fontSans, fontSize: 14, lineHeight: 20, color: tokens.textSec }}>
          {item.summary}
        </Text>
        {context ? (
          <Text style={{ fontFamily: tokens.fontSans, fontSize: 12, fontWeight: "600", color: item.status === "shipped" ? tokens.good : tokens.textTer }}>
            {context}
          </Text>
        ) : null}
      </View>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          borderTopWidth: 1,
          borderTopColor: tokens.cardBorder,
          paddingHorizontal: 14,
          paddingVertical: 10,
        }}
      >
        {roadmapVotingOpen(item.status) ? (
          <VoteButton item={item} busy={busy} onPress={onVote} />
        ) : (
          <Text style={{ fontFamily: tokens.fontSans, fontSize: 13, fontWeight: "600", color: tokens.good }}>In the app</Text>
        )}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
          <Text style={{ fontFamily: tokens.fontSans, fontSize: 14, fontWeight: "600", color: tokens.primary }}>
            {item.status === "shipped" ? "What changed" : "Learn more"}
          </Text>
          <Ionicons name="chevron-forward" size={16} color={tokens.primary} />
        </View>
      </View>
    </Pressable>
  );
}
