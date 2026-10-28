import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";

import { useTheme } from "@/contexts/theme-context";
import { api } from "@/lib/api";

/**
 * "From a month ago" (Insights, 2026-10-27): one past entry from about a
 * month back that shares a theme with last week, as a short safe snippet
 * (a win or the summary, never the transcript). Server rules:
 * apps/web/src/lib/callback.ts (GET /api/insights/callback). Changes at
 * most once a week.
 *
 * Self-contained: fetches its own data and renders nothing without a good
 * match (or on error). Tapping it opens the past entry.
 */

type Callback = {
  entryId: string;
  pastDate: string;
  daysAgo: number;
  snippet: string;
  theme: string;
  now: string;
};

export function CallbackCard() {
  const { tokens } = useTheme();
  const router = useRouter();
  const [cb, setCb] = useState<Callback | null>(null);

  const load = useCallback(async () => {
    try {
      const d = await api.get<{ callback: Callback | null }>("/api/insights/callback");
      setCb(d?.callback ?? null);
    } catch {
      setCb(null); // silent: the card just doesn't show
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (!cb) return null;

  return (
    <Pressable
      onPress={() => router.push(`/entry/${cb.entryId}` as never)}
      accessibilityRole="button"
      accessibilityLabel={`From a month ago: ${cb.snippet}. ${cb.now}`}
      accessibilityHint="Opens that entry"
      className="mb-6 rounded-2xl border p-4"
      style={{ borderColor: tokens.line, backgroundColor: tokens.cardBg }}
    >
      <View className="mb-2 flex-row items-center justify-between">
        <Text
          className="text-xs font-semibold uppercase tracking-widest"
          style={{ color: tokens.textTer }}
        >
          From a month ago
        </Text>
        <Ionicons name="chevron-forward" size={16} color={tokens.textTer} />
      </View>
      <View className="flex-row" style={{ gap: 10 }}>
        <View style={{ width: 3, borderRadius: 2, backgroundColor: tokens.primary }} />
        <Text className="flex-1 text-base" style={{ color: tokens.text, fontStyle: "italic" }}>
          “{cb.snippet}”
        </Text>
      </View>
      <Text className="mt-3 text-sm" style={{ color: tokens.textSec }}>
        {cb.now}
      </Text>
    </Pressable>
  );
}
