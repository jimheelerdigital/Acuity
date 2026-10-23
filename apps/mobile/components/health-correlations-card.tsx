import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { Text, View } from "react-native";

import { useTheme } from "@/contexts/theme-context";
import { api } from "@/lib/api";

/**
 * Mobile counterpart to apps/web/src/components/health-correlations-card.tsx
 * (1.9.6). Same endpoint: simple mood ↔ Apple Health observations over the
 * last 30 days. Renders nothing until there are at least 7 days with both
 * an entry and Health data (the server returns an empty list before then).
 */

type Correlation = {
  kind: "sleep" | "steps" | "hrv" | "active";
  direction: "up" | "down" | "flat";
  observation: string;
  pairedDays: number;
};

const ICON: Record<Correlation["kind"], keyof typeof Ionicons.glyphMap> = {
  sleep: "moon-outline",
  steps: "footsteps-outline",
  hrv: "pulse-outline",
  active: "flame-outline",
};

export function HealthCorrelationsCard() {
  const { tokens } = useTheme();
  const [items, setItems] = useState<Correlation[] | null>(null);

  useEffect(() => {
    let alive = true;
    api
      .get<{ correlations: Correlation[] }>("/api/insights/health-correlations")
      .then((r) => alive && setItems(r.correlations ?? []))
      .catch(() => alive && setItems([]));
    return () => {
      alive = false;
    };
  }, []);

  if (!items || items.length === 0) return null;

  return (
    <View
      className="mb-6 rounded-2xl border p-4"
      style={{ borderColor: tokens.line, backgroundColor: tokens.cardBg }}
    >
      <Text
        className="mb-3 text-xs font-semibold uppercase tracking-widest"
        style={{ color: tokens.textTer }}
      >
        Health & mood
      </Text>
      {items.map((c) => (
        <View key={c.kind} className="flex-row items-start mb-3">
          <Ionicons name={ICON[c.kind]} size={18} color={tokens.primary} style={{ marginTop: 1 }} />
          <View className="flex-1 ml-3">
            <Text className="text-sm" style={{ color: tokens.text, lineHeight: 20 }}>
              {c.observation}
            </Text>
            <Text className="text-[11px] mt-0.5" style={{ color: tokens.textTer }}>
              Based on {c.pairedDays} days
            </Text>
          </View>
        </View>
      ))}
      <Text className="text-[11px]" style={{ color: tokens.textTer }}>
        Patterns, not proof. From Apple Health and your entries.
      </Text>
    </View>
  );
}
