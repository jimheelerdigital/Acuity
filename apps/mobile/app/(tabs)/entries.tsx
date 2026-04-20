import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  MOOD_EMOJI,
  MOOD_LABELS,
  type EntryDTO,
  type Mood,
} from "@acuity/shared";

import { api } from "@/lib/api";

/**
 * Entries tab — full-screen chronological list with search + mood
 * filter. Distinct from Home (which shows the 10 most recent inline
 * with the Record CTA) because power users want to search their full
 * journal history without scrolling past the Record card.
 */
export default function EntriesTab() {
  const router = useRouter();
  const [entries, setEntries] = useState<EntryDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState("");
  const [moodFilter, setMoodFilter] = useState<Mood | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await api.get<{ entries: EntryDTO[] }>("/api/entries");
      setEntries(data.entries ?? []);
    } catch {
      setEntries([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      load();
    }, [load])
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load();
  }, [load]);

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
        <Text className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
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
                onPress={() => setMoodFilter(m === "ALL" ? null : (m as Mood))}
                className={`rounded-full px-3 py-1 border ${
                  selected
                    ? "border-violet-500 bg-violet-500/10 dark:border-violet-400 dark:bg-violet-500/20"
                    : "border-zinc-200 bg-transparent dark:border-white/10"
                }`}
              >
                <Text
                  className={`text-xs font-medium ${
                    selected
                      ? "text-violet-700 dark:text-violet-300"
                      : "text-zinc-500 dark:text-zinc-400"
                  }`}
                >
                  {m === "ALL"
                    ? "All"
                    : `${MOOD_EMOJI[m as Mood]} ${MOOD_LABELS[m as Mood]}`}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#7C3AED" />
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
}: {
  entry: EntryDTO;
  onPress: () => void;
}) {
  const date = new Date(entry.createdAt);
  const dateLabel = formatRelativeDate(date);
  return (
    <Pressable
      onPress={onPress}
      className="rounded-2xl border border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-[#1E1E2E] px-4 py-3"
      style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
    >
      <View className="flex-row items-center gap-2 flex-wrap mb-1">
        <Text className="text-xs text-zinc-500 dark:text-zinc-400">
          {dateLabel}
        </Text>
        {entry.mood && (
          <Text className="text-xs text-zinc-500 dark:text-zinc-400">
            · {MOOD_EMOJI[entry.mood as Mood] ?? ""}{" "}
            {MOOD_LABELS[entry.mood as Mood] ?? ""}
          </Text>
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
