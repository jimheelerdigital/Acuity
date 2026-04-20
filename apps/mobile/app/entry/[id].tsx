import { useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  Text,
  View,
} from "react-native";

import { MOOD_EMOJI, MOOD_LABELS, type EntryDTO, type TaskDTO } from "@acuity/shared";

import { api } from "@/lib/api";

type EntryDetail = EntryDTO & { tasks: TaskDTO[] };

export default function EntryDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [entry, setEntry] = useState<EntryDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get<{ entry: EntryDetail }>(`/api/entries/${id}`)
      .then((d) => setEntry(d.entry ?? null))
      .catch(() => setEntry(null))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <View className="flex-1 bg-zinc-950 items-center justify-center">
        <ActivityIndicator color="#7C3AED" />
      </View>
    );
  }

  if (!entry) {
    return (
      <View className="flex-1 bg-zinc-950 items-center justify-center">
        <Text className="text-zinc-400">Entry not found.</Text>
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
      className="flex-1 bg-zinc-950"
      contentContainerStyle={{ padding: 20, paddingBottom: 48, gap: 20 }}
    >
      {/* Header */}
      <View>
        <Text className="text-xs text-zinc-500 mb-1">{date}</Text>
        <View className="flex-row items-center gap-3">
          {entry.mood && (
            <Text className="text-lg">
              {MOOD_EMOJI[entry.mood]} {MOOD_LABELS[entry.mood]}
            </Text>
          )}
          {entry.energy !== null && (
            <Text className="text-sm text-zinc-400">Energy {entry.energy}/10</Text>
          )}
        </View>
      </View>

      {/* Summary */}
      {entry.summary && (
        <Section title="Summary">
          <Text className="text-sm text-zinc-200 leading-relaxed">
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
                <Text className="text-xs text-zinc-300">{t}</Text>
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
              <Text className="text-sm text-zinc-200 flex-1">{w}</Text>
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
              <Text className="text-sm text-zinc-200 flex-1">{b}</Text>
            </View>
          ))}
        </Section>
      )}

      {/* Tasks */}
      {entry.tasks.length > 0 && (
        <Section title={`Tasks (${entry.tasks.length})`}>
          {entry.tasks.map((t) => (
            <View
              key={t.id}
              className="rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 mb-2"
            >
              <Text className="text-sm text-zinc-100">{t.title}</Text>
              <Text className="text-xs text-zinc-500 mt-0.5">
                {t.priority} · {t.status.replace("_", " ")}
              </Text>
            </View>
          ))}
        </Section>
      )}

      {/* Transcript */}
      <Section title="Transcript">
        <Text className="text-sm text-zinc-400 leading-relaxed">
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
      <Text className="text-xs font-semibold uppercase tracking-widest text-zinc-500 mb-2">
        {title}
      </Text>
      {children}
    </View>
  );
}
