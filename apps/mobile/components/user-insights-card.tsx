import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";

import { useTheme } from "@/contexts/theme-context";
import { api } from "@/lib/api";
import { WARN_AMBER } from "@/lib/tone-colors";

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

// Q11e-rest: SEVERITY_ACCENT collapsed to a tone-aware function so the
// per-severity color resolves from palette tokens at render time
// (POSITIVE → tokens.good, NEUTRAL → tokens.textTer, CONCERNING →
// WARN_AMBER). Was hardcoded #10B981 / #A1A1AA / #F59E0B.

export function UserInsightsCard() {
  const { tokens } = useTheme();
  const severityAccent = (sev: Severity): { icon: keyof typeof Ionicons.glyphMap; color: string } => {
    switch (sev) {
      case "POSITIVE":
        return { icon: "arrow-up", color: tokens.good };
      case "CONCERNING":
        return { icon: "arrow-down", color: WARN_AMBER };
      case "NEUTRAL":
      default:
        return { icon: "information-circle", color: tokens.textTer };
    }
  };

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
      <Text
        className="mb-2 text-xs font-semibold uppercase tracking-widest"
        style={{ color: tokens.textTer }}
      >
        What we noticed
      </Text>
      <View className="gap-2">
        {items.map((o) => {
          const s = severityAccent(o.severity);
          return (
            <View
              key={o.id}
              className="flex-row items-start gap-2 rounded-xl px-3 py-3 border"
              style={{
                borderColor: tokens.line,
                backgroundColor: tokens.cardBg,
                borderLeftColor: s.color,
                borderLeftWidth: 3,
              }}
            >
              <Ionicons
                name={s.icon}
                size={14}
                color={s.color}
                style={{ marginTop: 2 }}
              />
              <Text
                className="flex-1 text-sm leading-5"
                style={{ color: tokens.textSec }}
              >
                {o.observationText}
              </Text>
              <Pressable onPress={() => dismiss(o.id)} hitSlop={8}>
                <Ionicons name="close" size={16} color={tokens.textTer} />
              </Pressable>
            </View>
          );
        })}
      </View>
    </View>
  );
}
