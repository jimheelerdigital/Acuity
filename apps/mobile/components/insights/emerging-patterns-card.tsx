import { useEffect, useState } from "react";
import { Text, View } from "react-native";

import { useTheme } from "@/contexts/theme-context";
import { api } from "@/lib/api";

/**
 * "Starting to notice" — the app's copy of the web /insights early peek
 * (PR #49). Up to two themes that have each come up in 2+ entries, with
 * a hedged sentence that quotes no counts. From entry 2 until the Theme
 * Map unlocks; the Theme Map replaces it.
 *
 * Data: GET /api/insights/emerging-patterns. Rules live server-side in
 * apps/web/src/lib/emerging-patterns.ts.
 *
 * Gating: the Theme Map gate comes from the caller's progression (the
 * Insights tab already has it). Renders nothing until progression is
 * known, once the Theme Map is unlocked, while loading, on error, and
 * when there's nothing to say. Deliberately no empty state: a "no
 * patterns yet" card on a 2-entry account would just be a nag.
 */

type Response = { themes: { label: string }[]; copy: string | null };

export function EmergingPatternsCard({
  progression,
}: {
  progression: { unlocked: { themeMap: boolean } } | null | undefined;
}) {
  const { tokens } = useTheme();
  const [data, setData] = useState<Response | null>(null);
  const gateOpen = !!progression && !progression.unlocked.themeMap;

  useEffect(() => {
    if (!gateOpen) return;
    let cancelled = false;
    api
      .get<Response>("/api/insights/emerging-patterns")
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch(() => {
        // Silent: this card is a bonus, never an error surface.
      });
    return () => {
      cancelled = true;
    };
  }, [gateOpen]);

  if (!gateOpen || !data || !data.copy || data.themes.length === 0) {
    return null;
  }

  return (
    <View
      className="mb-6 rounded-2xl border p-4"
      style={{ borderColor: tokens.line, backgroundColor: tokens.cardBg }}
    >
      <Text
        className="text-xs font-semibold uppercase tracking-widest"
        style={{ color: tokens.textTer }}
      >
        Early days
      </Text>
      <Text
        className="mt-1 text-lg font-semibold"
        style={{ color: tokens.text, fontFamily: tokens.fontDisplay }}
      >
        Starting to notice
      </Text>
      <View className="mt-3 flex-row flex-wrap" style={{ gap: 8 }}>
        {data.themes.map((t) => (
          <View
            key={t.label}
            className="rounded-full px-3 py-1"
            style={{ backgroundColor: tokens.bgInset }}
          >
            <Text className="text-[13px] font-medium" style={{ color: tokens.text }}>
              {t.label}
            </Text>
          </View>
        ))}
      </View>
      <Text
        className="mt-3 text-[14px] leading-5"
        style={{ color: tokens.textSec }}
      >
        {data.copy}
      </Text>
    </View>
  );
}
