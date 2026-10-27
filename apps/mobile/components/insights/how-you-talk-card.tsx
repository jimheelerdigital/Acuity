import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useState } from "react";
import { Text, View } from "react-native";

import { useTheme } from "@/contexts/theme-context";
import { api } from "@/lib/api";

/**
 * "How you talk" (2026-10-27): up to 3 shifts in the user's own feeling
 * words, last 30 days vs the 30 before. Server: GET /api/insights/how-you-talk
 * (lib/how-you-talk.ts holds the lexicon + thresholds). Self-contained:
 * fetches its own data and renders nothing until both periods have enough
 * talking and at least one clear shift. Errors stay silent, like the other
 * metrics cards.
 */

type Shift = {
  group: string;
  word: string;
  direction: "up" | "down" | "new" | "gone";
  text: string;
};

type Data = { periodDays: number; enoughData: boolean; shifts: Shift[] };

const ICON: Record<Shift["direction"], keyof typeof Ionicons.glyphMap> = {
  up: "trending-up",
  down: "trending-down",
  new: "sparkles-outline",
  gone: "remove-circle-outline",
};

export function HowYouTalkCard() {
  const { tokens } = useTheme();
  const [data, setData] = useState<Data | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await api.get<Data>("/api/insights/how-you-talk"));
    } catch {
      // silent: the card just doesn't show
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (!data || !data.enoughData || data.shifts.length === 0) return null;

  return (
    <View
      className="mb-6 rounded-2xl border p-4"
      style={{ borderColor: tokens.line, backgroundColor: tokens.cardBg }}
    >
      <Text
        className="mb-1 text-xs font-semibold uppercase tracking-widest"
        style={{ color: tokens.textTer }}
      >
        How you talk
      </Text>
      <Text className="mb-3 text-[11px]" style={{ color: tokens.textTer }}>
        Your own words, last 30 days vs the 30 before
      </Text>
      {data.shifts.map((s) => (
        <View key={s.group} className="mb-2 flex-row items-start" style={{ gap: 8 }}>
          <Ionicons
            name={ICON[s.direction]}
            size={16}
            color={tokens.primary}
            style={{ marginTop: 2 }}
          />
          <Text className="flex-1 text-sm" style={{ color: tokens.text }}>
            {s.text}
          </Text>
        </View>
      ))}
    </View>
  );
}
