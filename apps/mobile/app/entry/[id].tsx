import { Ionicons } from "@expo/vector-icons";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActionSheetIOS,
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";

import { MOOD_LABELS, type EntryDTO, type TaskDTO } from "@acuity/shared";

import { ExtractionReview } from "@/components/extraction-review";
import { MoodIcon } from "@/components/mood-icon";
import { api } from "@/lib/api";
import { getCached, invalidate, isStale, setCached } from "@/lib/cache";

type EntryDetail = EntryDTO & { tasks: TaskDTO[] };

type EntryDetailResponse = { entry: EntryDetail };

function entryDetailKey(id: string): string {
  return `/api/entries/${id}`;
}

export default function EntryDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const cacheKey = id ? entryDetailKey(id) : null;
  const initialCached = cacheKey
    ? getCached<EntryDetailResponse>(cacheKey)
    : undefined;

  const [entry, setEntry] = useState<EntryDetail | null>(
    () => initialCached?.entry ?? null
  );
  const [loading, setLoading] = useState(() => !initialCached);

  const requestDelete = useCallback(() => {
    if (!id) return;
    Alert.alert(
      "Delete this entry?",
      "This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await api.del(`/api/entries/${id}`);
              // Drop both this detail's cache and the list cache so
              // the entries tab refetches fresh data on focus.
              invalidate(entryDetailKey(id));
              invalidate("/api/entries");
              router.back();
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
  }, [id, router]);

  const openMenu = useCallback(() => {
    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: ["Cancel", "Delete entry"],
          destructiveButtonIndex: 1,
          cancelButtonIndex: 0,
        },
        (idx) => {
          if (idx === 1) requestDelete();
        }
      );
    } else {
      Alert.alert(
        "Entry options",
        undefined,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Delete entry",
            style: "destructive",
            onPress: requestDelete,
          },
        ],
        { cancelable: true }
      );
    }
  }, [requestDelete]);

  const reload = useCallback(() => {
    if (!cacheKey) return;
    api
      .get<EntryDetailResponse>(cacheKey)
      .then((d) => {
        setCached(cacheKey, d);
        setEntry(d.entry ?? null);
      })
      .catch(() => {
        // Keep cached state on failure; only null out on cold miss.
        setEntry((prev) => prev ?? null);
      })
      .finally(() => setLoading(false));
  }, [cacheKey]);

  useEffect(() => {
    if (!cacheKey) return;
    if (!initialCached || isStale(cacheKey)) reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheKey]);

  // Hooks must run on every render in the same order. Keep useMemo
  // above the early returns and guard against a null entry inside.
  const date = useMemo(
    () =>
      entry?.createdAt
        ? new Date(entry.createdAt).toLocaleDateString("en-US", {
            weekday: "long",
            month: "long",
            day: "numeric",
          })
        : "",
    [entry?.createdAt]
  );

  // Per-screen header override: adds an ellipsis button in the top
  // right that opens the iOS action sheet (or Android Alert) with a
  // destructive Delete option. Same flow as the swipe / long-press
  // paths on the entries list.
  const headerRight = useCallback(
    () => (
      <Pressable
        onPress={openMenu}
        hitSlop={12}
        accessibilityRole="button"
        accessibilityLabel="Entry options"
      >
        <Ionicons
          name="ellipsis-horizontal"
          size={22}
          color={Platform.select({ ios: "#7C3AED", android: "#7C3AED" })}
        />
      </Pressable>
    ),
    [openMenu]
  );

  if (loading) {
    return (
      <>
        <Stack.Screen options={{ headerRight }} />
        <View className="flex-1 bg-white dark:bg-[#1E1E2E] dark:bg-[#0B0B12] items-center justify-center">
          <ActivityIndicator color="#7C3AED" />
        </View>
      </>
    );
  }

  if (!entry) {
    return (
      <View className="flex-1 bg-white dark:bg-[#1E1E2E] dark:bg-[#0B0B12] items-center justify-center">
        <Text className="text-zinc-400 dark:text-zinc-500">Entry not found.</Text>
      </View>
    );
  }

  return (
    <ScrollView
      className="flex-1 bg-white dark:bg-[#1E1E2E] dark:bg-[#0B0B12]"
      contentContainerStyle={{ padding: 20, paddingBottom: 48, gap: 20 }}
    >
      <Stack.Screen options={{ headerRight }} />
      {/* Header */}
      <View>
        <Text className="text-xs text-zinc-500 dark:text-zinc-400 mb-1">{date}</Text>
        <View className="flex-row items-center gap-3">
          {entry.mood && (
            <View className="flex-row items-center gap-2">
              <MoodIcon mood={entry.mood} size={22} color="#A1A1AA" />
              <Text className="text-lg text-zinc-800 dark:text-zinc-100">
                {MOOD_LABELS[entry.mood]}
              </Text>
            </View>
          )}
          {entry.energy !== null && (
            <Text className="text-sm text-zinc-400 dark:text-zinc-500">Energy {entry.energy}/10</Text>
          )}
        </View>
      </View>

      <ExtractionReview entryId={entry.id} onCommitted={reload} />


      {/* Summary */}
      {entry.summary && (
        <Section title="Summary">
          <Text className="text-sm text-zinc-700 dark:text-zinc-200 leading-relaxed">
            {entry.summary}
          </Text>
        </Section>
      )}

      {/* Themes */}
      {entry.themes.length > 0 && (
        <Section title="Themes">
          <View className="flex-row flex-wrap gap-2">
            {entry.themes.map((t) => (
              <View key={t} className="rounded-full bg-zinc-800 px-3 py-1">
                <Text className="text-xs text-zinc-600 dark:text-zinc-300">{t}</Text>
              </View>
            ))}
          </View>
        </Section>
      )}

      {/* Wins */}
      {entry.wins.length > 0 && (
        <Section title="Wins">
          {entry.wins.map((w, i) => (
            <View key={i} className="flex-row gap-2 mb-1.5">
              <Text className="text-green-500">✓</Text>
              <Text className="text-sm text-zinc-700 dark:text-zinc-200 flex-1">{w}</Text>
            </View>
          ))}
        </Section>
      )}

      {/* Blockers */}
      {entry.blockers.length > 0 && (
        <Section title="Blockers">
          {entry.blockers.map((b, i) => (
            <View key={i} className="flex-row gap-2 mb-1.5">
              <Text className="text-red-400">↳</Text>
              <Text className="text-sm text-zinc-700 dark:text-zinc-200 flex-1">{b}</Text>
            </View>
          ))}
        </Section>
      )}

      {/* Tasks */}
      {entry.tasks.length > 0 && (
        <Section title={`Tasks (${entry.tasks.length})`}>
          {entry.tasks.map((t) => {
            // Legacy rows may only have `text` (pre-title-field); newer
            // rows have `title`. Read title first, fall back gracefully.
            const label =
              t.title ??
              (t as { text?: string | null }).text ??
              "Untitled task";
            return (
              <View
                key={t.id}
                className="rounded-xl border border-zinc-200 dark:border-white/10 bg-zinc-50 dark:bg-[#13131F] dark:bg-[#1E1E2E] px-4 py-3 mb-2"
              >
                <Text className="text-sm text-zinc-800 dark:text-zinc-100">
                  {label}
                </Text>
                {t.description && (
                  <Text className="text-xs text-zinc-400 dark:text-zinc-500 mt-1 leading-relaxed">
                    {t.description}
                  </Text>
                )}
                <Text className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                  {t.priority} · {t.status.replace("_", " ")}
                </Text>
              </View>
            );
          })}
        </Section>
      )}

      {/* Transcript */}
      <Section title="Transcript">
        <Text className="text-sm text-zinc-400 dark:text-zinc-500 leading-relaxed">
          {entry.transcript || "Transcript still processing…"}
        </Text>
      </Section>
    </ScrollView>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View>
      <Text className="text-xs font-semibold uppercase tracking-widest text-zinc-500 dark:text-zinc-400 mb-2">
        {title}
      </Text>
      {children}
    </View>
  );
}
