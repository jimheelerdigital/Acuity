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
  isEntryTappable,
  MOOD_LABELS,
  PROCESSING_ENTRY_STATUSES,
  type EntryDTO,
  type Mood,
} from "@acuity/shared";

import { Heatmap28 } from "@/components/entries/heatmap-28";
import { MoodIcon } from "@/components/mood-icon";
import { Skeleton, SkeletonCard } from "@/components/skeleton";
import { useTheme } from "@/contexts/theme-context";
import { api } from "@/lib/api";
import { cachedGet, getCached, isStale, setCached } from "@/lib/cache";
import { WARN_AMBER } from "@/lib/tone-colors";

const ENTRIES_CACHE_KEY = "/api/entries";

// Re-export the shared set (single source of truth in @acuity/shared) so the
// "Processing" badge + the Entries tab dot can't drift from the lock logic.
export const PROCESSING_STATUSES = PROCESSING_ENTRY_STATUSES;

/**
 * Entries tab — full-screen chronological list with search + mood
 * filter. Distinct from Home (which shows the 10 most recent inline
 * with the Record CTA) because power users want to search their full
 * journal history without scrolling past the Record card.
 */
export default function EntriesTab() {
  const router = useRouter();
  const { tokens } = useTheme();
  const [entries, setEntries] = useState<EntryDTO[]>(
    () => getCached<{ entries: EntryDTO[] }>(ENTRIES_CACHE_KEY)?.entries ?? []
  );
  const [loading, setLoading] = useState(
    () => !getCached<{ entries: EntryDTO[] }>(ENTRIES_CACHE_KEY)
  );
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState("");
  const [moodFilter, setMoodFilter] = useState<Mood | null>(null);

  const load = useCallback(async (force = false) => {
    try {
      // Shared cache + in-flight dedupe: Home also fetches /api/entries,
      // so concurrent post-login loads collapse to one request. cachedGet
      // writes the cache; pull-to-refresh forces a fresh fetch.
      const data = await cachedGet<{ entries: EntryDTO[] }>(ENTRIES_CACHE_KEY, {
        force,
      });
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
    load(true);
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
      className="flex-1"
      edges={["top"]}
      style={{ backgroundColor: tokens.bg }}
    >
      <View className="px-5 pt-2 pb-3 gap-3">
        <Text
          className="text-4xl font-bold"
          style={{ color: tokens.text }}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.75}
        >
          Entries
        </Text>

        <View
          className="flex-row items-center gap-2 rounded-2xl border px-3 py-2"
          style={{
            borderColor: tokens.line,
            backgroundColor: tokens.bgInset,
          }}
        >
          <Ionicons name="search" size={16} color={tokens.textTer} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search summaries, themes, transcripts"
            placeholderTextColor={tokens.textTer}
            className="flex-1 text-sm"
            style={{ paddingVertical: 4, color: tokens.text }}
            returnKeyType="search"
          />
          {query.length > 0 && (
            <Pressable onPress={() => setQuery("")} hitSlop={8}>
              <Ionicons name="close-circle" size={16} color={tokens.textTer} />
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
                className="flex-row items-center gap-1.5 rounded-full px-3 py-2 border"
                style={{
                  borderColor: selected ? tokens.primary : tokens.line,
                  backgroundColor: selected
                    ? `${tokens.primary}1f`
                    : "transparent",
                }}
              >
                {m !== "ALL" && (
                  <MoodIcon
                    mood={m}
                    size={13}
                    color={selected ? tokens.primary : tokens.textTer}
                  />
                )}
                <Text
                  className="text-xs font-medium"
                  style={{
                    color: selected ? tokens.primary : tokens.textSec,
                  }}
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
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={tokens.primary}
            />
          }
          contentContainerStyle={{
            paddingHorizontal: 20,
            paddingBottom: 40,
            gap: 8,
          }}
          ListHeaderComponent={
            entries.length > 0 ? (
              <View style={{ marginBottom: 12 }}>
                <Heatmap28
                  entries={entries}
                  onEntryPress={(entryId) =>
                    router.push(`/entry/${entryId}`)
                  }
                />
              </View>
            ) : null
          }
          ListEmptyComponent={() => (
            <View
              className="rounded-2xl border border-dashed p-8 items-center mt-8"
              style={{ borderColor: tokens.line }}
            >
              <Text className="text-3xl mb-3">
                {entries.length === 0 ? "🎙️" : "🔍"}
              </Text>
              <Text
                className="text-sm font-medium mb-1"
                style={{ color: tokens.textSec }}
              >
                {entries.length === 0
                  ? "Your journal is empty"
                  : "Nothing matches that filter"}
              </Text>
              <Text
                className="text-xs text-center"
                style={{ color: tokens.textTer }}
              >
                {entries.length === 0
                  ? "Tap the mic at the center of the tab bar to record your first entry."
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
  const { tokens } = useTheme();
  const date = new Date(entry.createdAt);
  const dateLabel = formatRelativeDate(date);
  const swipeRef = useRef<Swipeable | null>(null);
  // Issue A (v1.3.3): lock the row while processing — not tappable + faded.
  // Swipe + long-press (delete) stay available so a stuck entry is removable.
  const isLocked = !isEntryTappable(entry.status);

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
        backgroundColor: tokens.bad,
        justifyContent: "center",
        alignItems: "center",
        width: 88,
        borderTopRightRadius: 16,
        borderBottomRightRadius: 16,
      }}
    >
      <Ionicons name="trash-outline" size={20} color="#FFFFFF" />
      <Text style={{ color: "#FFFFFF", fontSize: 12, fontWeight: "600", marginTop: 4 }}>
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
      onPress={isLocked ? undefined : onPress}
      onLongPress={onLongPress}
      delayLongPress={350}
      className="rounded-2xl border px-4 py-3"
      style={{
        borderColor: tokens.line,
        backgroundColor: tokens.cardBg,
        opacity: isLocked ? 0.55 : 1,
      }}
    >
      <View className="flex-row items-center gap-2 flex-wrap mb-1">
        <Text
          className="text-xs"
          style={{ color: tokens.textSec }}
        >
          {dateLabel}
        </Text>
        {entry.mood && (
          <View className="flex-row items-center gap-1">
            <Text
              className="text-xs"
              style={{ color: tokens.textTer }}
            >
              ·
            </Text>
            <MoodIcon mood={entry.mood} size={12} color={tokens.textTer} />
            <Text
              className="text-xs"
              style={{ color: tokens.textSec }}
            >
              {MOOD_LABELS[entry.mood as Mood] ?? ""}
            </Text>
          </View>
        )}
        {/* In-progress badge (v1.3.3): non-terminal entries show their
            phase so a still-processing recording is visible in the list. */}
        {PROCESSING_STATUSES.has(entry.status) && (
          <View
            className="rounded-full px-2 py-0.5"
            style={{ backgroundColor: `${tokens.primary}22` }}
          >
            <Text
              className="text-[10px] font-semibold"
              style={{ color: tokens.primary }}
            >
              {entry.status === "TRANSCRIBING"
                ? "Transcribing"
                : entry.status === "EXTRACTING"
                  ? "Extracting"
                  : "Processing"}
            </Text>
          </View>
        )}
        {/* PARTIAL status badge uses WARN_AMBER from lib/tone-colors
            — single source of truth for the warning-amber accent. */}
        {entry.status === "PARTIAL" && (
          <View
            className="rounded-full px-2 py-0.5"
            style={{ backgroundColor: `${WARN_AMBER}33` }}
          >
            <Text
              className="text-[10px] font-semibold"
              style={{ color: WARN_AMBER }}
            >
              PARTIAL
            </Text>
          </View>
        )}
      </View>
      <Text
        className="text-sm"
        numberOfLines={3}
        style={{ color: tokens.textSec }}
      >
        {entry.summary ?? entry.transcript ?? "(no summary)"}
      </Text>
      {entry.themes && entry.themes.length > 0 && (
        <View className="flex-row flex-wrap gap-1 mt-2">
          {entry.themes.slice(0, 3).map((t) => (
            <View
              key={t}
              className="rounded-full px-2 py-0.5"
              style={{ backgroundColor: tokens.bgInset }}
            >
              <Text
                className="text-[10px]"
                style={{ color: tokens.textSec }}
              >
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
