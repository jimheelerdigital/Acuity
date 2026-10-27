import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";

import { useTheme } from "@/contexts/theme-context";
import { api } from "@/lib/api";

/**
 * Open loops (Insights, 2026-10-27): up to 3 worries that keep coming up
 * and active goals that have gone quiet. Server rules:
 * apps/web/src/lib/open-loops.ts (GET /api/insights/open-loops).
 *
 * Self-contained: fetches its own data and renders nothing until there is
 * at least one loop (or on error), so it's safe to drop anywhere on the
 * Insights tab. Tapping an item opens the theme or goal.
 */

type OpenLoop =
  | {
      kind: "worry";
      themeId: string;
      label: string;
      text: string;
    }
  | {
      kind: "quiet_goal";
      goalId: string;
      label: string;
      text: string;
    };

export function OpenLoopsCard() {
  const { tokens } = useTheme();
  const router = useRouter();
  const [loops, setLoops] = useState<OpenLoop[] | null>(null);

  const load = useCallback(async () => {
    try {
      const d = await api.get<{ loops: OpenLoop[] }>("/api/insights/open-loops");
      setLoops(Array.isArray(d?.loops) ? d.loops : []);
    } catch {
      setLoops([]); // silent: the card just doesn't show
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (!loops || loops.length === 0) return null;

  return (
    <View
      className="mb-6 rounded-2xl border p-4"
      style={{ borderColor: tokens.line, backgroundColor: tokens.cardBg }}
    >
      <Text
        className="mb-1 text-xs font-semibold uppercase tracking-widest"
        style={{ color: tokens.textTer }}
      >
        Open loops
      </Text>
      <Text className="mb-3 text-xs" style={{ color: tokens.textSec }}>
        Things that keep coming up, and goals that have gone quiet.
      </Text>

      {loops.map((loop, i) => {
        const key = loop.kind === "worry" ? `w-${loop.themeId}` : `g-${loop.goalId}`;
        const href =
          loop.kind === "worry"
            ? `/insights/theme/${encodeURIComponent(loop.themeId)}`
            : `/goal/${loop.goalId}`;
        return (
          <Pressable
            key={key}
            onPress={() => router.push(href as never)}
            accessibilityRole="button"
            accessibilityLabel={loop.text}
            accessibilityHint={loop.kind === "worry" ? "Opens this theme" : "Opens this goal"}
            className="flex-row items-center py-2.5"
            style={
              i > 0
                ? { borderTopWidth: 1, borderTopColor: tokens.line }
                : undefined
            }
          >
            <Ionicons
              name={loop.kind === "worry" ? "repeat" : "flag-outline"}
              size={16}
              color={tokens.primary}
              style={{ marginRight: 10 }}
            />
            <Text className="flex-1 text-sm" style={{ color: tokens.text }}>
              {loop.text}
            </Text>
            <Ionicons name="chevron-forward" size={16} color={tokens.textTer} />
          </Pressable>
        );
      })}
    </View>
  );
}
