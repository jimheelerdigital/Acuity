import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useMemo, useRef, useState } from "react";
import {
  ActionSheetIOS,
  ActivityIndicator,
  Alert,
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  Text,
  TextInput,
  View,
} from "react-native";
import { Swipeable } from "react-native-gesture-handler";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  MOOD_LABELS,
  type EntryDTO,
  type Mood,
} from "@acuity/shared";

import { MoodIcon } from "@/components/mood-icon";
import { Skeleton, SkeletonCard } from "@/components/skeleton";
import { api } from "@/lib/api";
import { getCached, isStale, setCached } from "@/lib/cache";

const ENTRIES_CACHE_KEY = "/api/entries";

/**
 * Entries tab — full-screen chronological list with search + mood
 * filter. Distinct from Home (which shows the 10 most recent inline
 * with the Record CTA) because power users want to search their full
 * journal history without scrolling past the Record card.
 */
export default function EntriesTab() {
  const router = useRouter();
  const [entries, setEntries] = useState<EntryDTO[]>(
    () => getCached<{ entries: EntryDTO[] }>(ENTRIES_CACHE_KEY)?.entries ?? []
  );
  const [loading, setLoading] = useState(
    () => !getCached<{ entries: EntryDTO[] }>(ENTRIES_CACHE_KEY)
  );
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState("");
  const [moodFilter, setMoodFilter] = useState<Mood | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await api.get<{ entries: EntryDTO[] }>(ENTRIES_CACHE_KEY);
      setCached(ENTRIES_CACHE_KEY, data);
      setEntries(data.entries ?? []);
    } catch {
      // Keep existing cached entries on failure.
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Revalidate on focus only when stale. Cached list stays visible
  // during the network round-trip — no spinner flash on tab switches.
  useFocusEffect(
    useCallback(() => {
      if (isStale(ENTRIES_CACHE_KEY)) load();
    }, [load])
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load();
  }, [load]);

  // Shared confirmation + DELETE flow used by all three input methods
  // (swipe-left action, long-press context menu, entry-detail header).
  // Optimistic local removal — the server cache (Vercel CDN) plus our
  // own local cache will both pick up the new shape on next refocus.
  const requestDelete = useCallback((entry: EntryDTO) => {
    Alert.alert(
      "Delete this entry?",
      "This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            // Heavy impact on confirm-destroy — same haptic the
            // delete-account modal uses, so the destructive feel is
            // consistent across surfaces.
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(
              () => {}
            );
            try {
              await api.del(`/api/entries/${entry.id}`);
              setEntries((prev) => prev.filter((e) => e.id !== entry.id));
              setCached(ENTRIES_CACHE_KEY, {
                entries: entries.filter((e) => e.id !== entry.id),
              });
            } catch (err) {
              const message =
                err instanceof Error ? err.message : "Delete failed.";
              Alert.alert("Couldn't delete entry", message);
            }
          },
        },
      ],
      { cancelable: true }
    );
  }, [entries]);

  const openContextMenu = useCallback(
    (entry: EntryDTO) => {
      if (Platform.OS === "ios") {
        ActionSheetIOS.showActionSheetWithOptions(
          {
            options: ["Cancel", "Delete entry"],
            destructiveButtonIndex: 1,
            cancelButtonIndex: 0,
          },
          (idx) => {
            if (idx === 1) requestDelete(entry);
          }
        );
      } else {
        // Android fallback — same single-action choice via Alert.
        Alert.alert(
          "Entry options",
          undefined,
          [
            { text: "Cancel", style: "cancel" },
            {
              text: "Delete entry",
              style: "destructive",
              onPress: () => requestDelete(entry),
            },
          ],
          { cancelable: true }
        );
      }
    },
    [requestDelete]
  );

  // Filter — case-insensitive substring match against summary + themes
  // + transcript. Mood filter narrows further.
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return entries.filter((e) => {
      if (moodFilter && e.mood !== moodFilter) return false;
      if (!q) return true;
      const haystack = [
        e.summary ?? "",
        (e.themes ?? []).join(" "),
        e.transcript ?? "",
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [entries, query, moodFilter]);

  const moodOptions: (Mood | "ALL")[] = [
    "ALL",
    "GREAT",
    "GOOD",
    "NEUTRAL",
    "LOW",
    "ROUGH",
  ];

  return (
    <SafeAreaView
      className="flex-1 bg-white dark:bg-[#0B0B12]"
      edges={["top"]}
    >
      <View className="px-5 pt-2 pb-3 gap-3">
        <Text className="text-4xl font-bold text-zinc-900 dark:text-zinc-50">
          Entries
        </Text>

        <View className="flex-row items-center gap-2 rounded-2xl border border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-[#1E1E2E] px-3 py-2">
          <Ionicons name="search" size={16} color="#71717A" />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search summaries, themes, transcripts"
            placeholderTextColor="#71717A"
            className="flex-1 text-sm text-zinc-900 dark:text-zinc-50"
            style={{ paddingVertical: 4 }}
            returnKeyType="search"
          />
          {query.length > 0 && (
            <Pressable onPress={() => setQuery("")} hitSlop={8}>
              <Ionicons name="close-circle" size={16} color="#71717A" />
            </Pressable>
          )}
        </View>

        <View className="flex-row flex-wrap gap-1.5">
          {moodOptions.map((m) => {
            const selected =
              (m === "ALL" && moodFilter === null) || m === moodFilter;
            return (
              <Pressable
                key={m}
                onPress={() => {
                  Haptics.selectionAsync().catch(() => {});
                  setMoodFilter(m === "ALL" ? null : (m as Mood));
                }}
                hitSlop={10}
                className={`flex-row items-center gap-1.5 rounded-full px-3 py-2 border ${
                  selected
                    ? "border-violet-500 bg-violet-500/10 dark:border-violet-400 dark:bg-violet-500/20"
                    : "border-zinc-200 bg-transparent dark:border-white/10"
                }`}
              >
                {m !== "ALL" && (
                  <MoodIcon
                    mood={m}
                    size={13}
                    color={
                      selected
                        ? "#7C3AED"
                        : "#A1A1AA"
                    }
                  />
                )}
                <Text
                  className={`text-xs font-medium ${
                    selected
                      ? "text-violet-700 dark:text-violet-300"
                      : "text-zinc-500 dark:text-zinc-400"
                  }`}
                >
                  {m === "ALL" ? "All" : MOOD_LABELS[m as Mood]}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {loading ? (
        // Skeleton entry rows — match FlatList's loaded card footprint
        // so the swap reads as content resolving, not as a spinner
        // popping out and being replaced.
        <View style={{ paddingHorizontal: 16, gap: 12, paddingTop: 8 }}>
          {Array.from({ length: 5 }).map((_, i) => (
            <SkeletonCard key={i}>
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  marginBottom: 8,
                }}
              >
                <Skeleton width={120} height={14} />
                <Skeleton width={48} height={14} />
              </View>
              <Skeleton width="100%" height={12} />
              <Skeleton
                width="80%"
                height={12}
                style={{ marginTop: 6 }}
              />
            </SkeletonCard>
          ))}
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(e) => e.id}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="#7C3AED"
            />
          }
          contentContainerStyle={{
            paddingHorizontal: 20,
            paddingBottom: 40,
            gap: 8,
          }}
          ListEmptyComponent={() => (
            <View className="rounded-2xl border border-dashed border-zinc-200 dark:border-white/10 p-8 items-center mt-8">
              <Text className="text-3xl mb-3">
                {entries.length === 0 ? "🎙️" : "🔍"}
              </Text>
              <Text className="text-sm font-medium text-zinc-700 dark:text-zinc-200 mb-1">
                {entries.length === 0
                  ? "Your journal is empty"
                  : "Nothing matches that filter"}
              </Text>
              <Text className="text-xs text-zinc-500 dark:text-zinc-400 text-center">
                {entries.length === 0
                  ? "Tap the mic at the center of the tab bar to record your first brain dump."
                  : "Try a different search or clear the mood filter."}
              </Text>
            </View>
          )}
          renderItem={({ item }) => (
            <EntryRow
              entry={item}
              onPress={() => router.push(`/entry/${item.id}`)}
              onLongPress={() => openContextMenu(item)}
              onSwipeDelete={() => requestDelete(item)}
            />
          )}
        />
      )}
    </SafeAreaView>
  );
}

function EntryRow({
  entry,
  onPress,
  onLongPress,
  onSwipeDelete,
}: {
  entry: EntryDTO;
  onPress: () => void;
  onLongPress?: () => void;
  onSwipeDelete?: () => void;
}) {
  const date = new Date(entry.createdAt);
  const dateLabel = formatRelativeDate(date);
  const swipeRef = useRef<Swipeable | null>(null);

  const renderRightActions = () => (
    <Pressable
      onPress={() => {
        // Close swipe so the row settles back into the list before the
        // confirm Alert fires; otherwise the row sits half-revealed
        // behind the dialog.
        swipeRef.current?.close();
        onSwipeDelete?.();
      }}
      style={{
        backgroundColor: "#EF4444",
        justifyContent: "center",
        alignItems: "center",
        width: 88,
        borderTopRightRadius: 16,
        borderBottomRightRadius: 16,
      }}
    >
      <Ionicons name="trash-outline" size={20} color="white" />
      <Text style={{ color: "white", fontSize: 12, fontWeight: "600", marginTop: 4 }}>
        Delete
      </Text>
    </Pressable>
  );

  return (
    <Swipeable
      ref={swipeRef}
      renderRightActions={onSwipeDelete ? renderRightActions : undefined}
      friction={2}
      rightThreshold={40}
      overshootRight={false}
    >
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={350}
      className="rounded-2xl border border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-[#1E1E2E] px-4 py-3"
    >
      <View className="flex-row items-center gap-2 flex-wrap mb-1">
        <Text className="text-xs text-zinc-500 dark:text-zinc-400">
          {dateLabel}
        </Text>
        {entry.mood && (
          <View className="flex-row items-center gap-1">
            <Text className="text-xs text-zinc-500 dark:text-zinc-400">·</Text>
            <MoodIcon mood={entry.mood} size={12} color="#A1A1AA" />
            <Text className="text-xs text-zinc-500 dark:text-zinc-400">
              {MOOD_LABELS[entry.mood as Mood] ?? ""}
            </Text>
          </View>
        )}
        {entry.status === "PARTIAL" && (
          <View className="rounded-full bg-amber-900/40 px-2 py-0.5">
            <Text className="text-[10px] font-semibold text-amber-300">
              PARTIAL
            </Text>
          </View>
        )}
      </View>
      <Text
        className="text-sm text-zinc-700 dark:text-zinc-200"
        numberOfLines={3}
      >
        {entry.summary ?? entry.transcript ?? "(no summary)"}
      </Text>
      {entry.themes && entry.themes.length > 0 && (
        <View className="flex-row flex-wrap gap-1 mt-2">
          {entry.themes.slice(0, 3).map((t) => (
            <View
              key={t}
              className="rounded-full bg-zinc-200/60 dark:bg-white/10 px-2 py-0.5"
            >
              <Text className="text-[10px] text-zinc-600 dark:text-zinc-300">
                {t}
              </Text>
            </View>
          ))}
        </View>
      )}
    </Pressable>
    </Swipeable>
  );
}

/**
 * Relative date label: Today / Yesterday / Weekday (within a week) /
 * locale short date. Keeps the list skimmable without needing to
 * parse timestamps.
 */
function formatRelativeDate(date: Date): string {
  const now = new Date();
  const dayMs = 24 * 60 * 60 * 1000;
  const startOfDay = (d: Date) =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diffDays = Math.round(
    (startOfDay(now) - startOfDay(date)) / dayMs
  );
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays > 1 && diffDays < 7) return `${diffDays} days ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
