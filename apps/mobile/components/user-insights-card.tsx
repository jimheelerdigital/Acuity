import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";

import { api } from "@/lib/api";

/**
 * Mobile counterpart to apps/web/src/components/user-insights-card.tsx.
 * Same server endpoint (/api/insights/observations), same severity
 * coloring + dismiss-on-X interaction. Renders at the top of the
 * Insights tab.
 */

type Severity = "POSITIVE" | "NEUTRAL" | "CONCERNING";

type Observation = {
  id: string;
  observationText: string;
  severity: Severity;
};

const SEVERITY_ACCENT: Record<Severity, { bar: string; icon: string; color: string }> = {
  POSITIVE: { bar: "#10B981", icon: "arrow-up", color: "#10B981" },
  NEUTRAL: { bar: "#A1A1AA", icon: "information-circle", color: "#A1A1AA" },
  CONCERNING: { bar: "#F59E0B", icon: "arrow-down", color: "#F59E0B" },
};

export function UserInsightsCard() {
  const [items, setItems] = useState<Observation[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const data = await api.get<{ observations: Observation[] }>(
        "/api/insights/observations"
      );
      setItems(data.observations ?? []);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const dismiss = async (id: string) => {
    setItems((prev) => prev.filter((x) => x.id !== id));
    api.post("/api/insights/observations", { action: "dismiss", id }).catch(() => {});
  };

  if (loading || items.length === 0) return null;

  return (
    <View className="mb-6">
      <Text className="mb-2 text-xs font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">
        What we noticed
      </Text>
      <View className="gap-2">
        {items.map((o) => {
          const s = SEVERITY_ACCENT[o.severity];
          return (
            <View
              key={o.id}
              className="flex-row items-start gap-2 rounded-xl bg-white dark:bg-[#1E1E2E] px-3 py-3 border border-zinc-200 dark:border-white/10"
              style={{ borderLeftColor: s.bar, borderLeftWidth: 3 }}
            >
              <Ionicons
                name={s.icon as keyof typeof Ionicons.glyphMap}
                size={14}
                color={s.color}
                style={{ marginTop: 2 }}
              />
              <Text
                className="flex-1 text-sm text-zinc-700 dark:text-zinc-200 leading-5"
              >
                {o.observationText}
              </Text>
              <Pressable onPress={() => dismiss(o.id)} hitSlop={8}>
                <Ionicons name="close" size={16} color="#71717A" />
              </Pressable>
            </View>
          );
        })}
      </View>
    </View>
  );
}
