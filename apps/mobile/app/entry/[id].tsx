import { useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  Text,
  View,
} from "react-native";

import { MOOD_LABELS, type EntryDTO, type TaskDTO } from "@acuity/shared";

import { ExtractionReview } from "@/components/extraction-review";
import { MoodIcon } from "@/components/mood-icon";
import { api } from "@/lib/api";

type EntryDetail = EntryDTO & { tasks: TaskDTO[] };

export default function EntryDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [entry, setEntry] = useState<EntryDetail | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = () => {
    if (!id) return;
    api
      .get<{ entry: EntryDetail }>(`/api/entries/${id}`)
      .then((d) => setEntry(d.entry ?? null))
      .catch(() => setEntry(null))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (loading) {
    return (
      <View className="flex-1 bg-white dark:bg-[#1E1E2E] dark:bg-[#0B0B12] items-center justify-center">
        <ActivityIndicator color="#7C3AED" />
      </View>
    );
  }

  if (!entry) {
    return (
      <View className="flex-1 bg-white dark:bg-[#1E1E2E] dark:bg-[#0B0B12] items-center justify-center">
        <Text className="text-zinc-400 dark:text-zinc-500">Entry not found.</Text>
      </View>
    );
  }

  const date = new Date(entry.createdAt).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <ScrollView
      className="flex-1 bg-white dark:bg-[#1E1E2E] dark:bg-[#0B0B12]"
      contentContainerStyle={{ padding: 20, paddingBottom: 48, gap: 20 }}
    >
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
          {entry.transcript}
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
