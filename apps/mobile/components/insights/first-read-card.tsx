import { useEffect, useState, type ReactNode } from "react";
import { Text, View } from "react-native";

import { useTheme } from "@/contexts/theme-context";
import { api } from "@/lib/api";

/**
 * "Your first read" (2026-10-27): a small report once someone has 3+
 * completed entries, shown until Pattern Insights unlocks at 7. Mood and
 * energy so far, themes coming up more than once, and the tasks Ripple
 * pulled from their recordings.
 *
 * Data: GET /api/insights/first-read. Rules (minimum data, caps) live in
 * apps/web/src/lib/first-read.ts.
 *
 * Gating: Pattern Insights comes from the caller's progression. Renders
 * nothing until progression is known, once Pattern Insights unlocks,
 * while loading, on error, or when there's nothing honest to say.
 */

type FirstRead = {
  entriesCount: number;
  mood: { label: string; average: number; basedOn: number } | null;
  energy: { average: number; basedOn: number } | null;
  themes: string[];
  tasks: { count: number; titles: string[] } | null;
};

export function FirstReadCard({
  progression,
}: {
  progression: { unlocked: { patternInsights: boolean } } | null | undefined;
}) {
  const { tokens } = useTheme();
  const [data, setData] = useState<FirstRead | null>(null);
  const gateOpen = !!progression && !progression.unlocked.patternInsights;

  useEffect(() => {
    if (!gateOpen) return;
    let cancelled = false;
    api
      .get<{ firstRead: FirstRead | null }>("/api/insights/first-read")
      .then((d) => {
        if (!cancelled) setData(d.firstRead);
      })
      .catch(() => {
        // Silent: a bonus card, never an error surface.
      });
    return () => {
      cancelled = true;
    };
  }, [gateOpen]);

  if (!gateOpen || !data) return null;

  const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

  return (
    <View
      className="mb-6 rounded-2xl border p-4"
      style={{ borderColor: tokens.line, backgroundColor: tokens.cardBg }}
    >
      <Text
        className="text-xs font-semibold uppercase tracking-widest"
        style={{ color: tokens.textTer }}
      >
        After {data.entriesCount} debriefs
      </Text>
      <Text
        className="mt-1 text-lg font-semibold"
        style={{ color: tokens.text, fontFamily: tokens.fontDisplay }}
      >
        Your first read
      </Text>

      {data.mood ? (
        <Section label="Mood so far">
          <Text className="text-[15px]" style={{ color: tokens.text }}>
            {data.mood.label}, averaging {fmt(data.mood.average)} out of 10
            {data.energy ? `, with energy around ${fmt(data.energy.average)}` : ""}.
          </Text>
        </Section>
      ) : data.energy ? (
        <Section label="Energy so far">
          <Text className="text-[15px]" style={{ color: tokens.text }}>
            Around {fmt(data.energy.average)} out of 10.
          </Text>
        </Section>
      ) : null}

      {data.themes.length > 0 ? (
        <Section label="Coming up more than once">
          <Text className="text-[15px]" style={{ color: tokens.text }}>
            {data.themes.join(" and ")}. It's early, so these might be nothing yet.
          </Text>
        </Section>
      ) : null}

      {data.tasks ? (
        <Section label="Captured for you">
          <Text className="text-[15px]" style={{ color: tokens.text }}>
            Ripple pulled {data.tasks.count} task{data.tasks.count === 1 ? "" : "s"} out of what you
            said.
          </Text>
          {data.tasks.titles.map((t) => (
            <Text
              key={t}
              className="mt-1 text-[14px]"
              style={{ color: tokens.textSec }}
              numberOfLines={1}
            >
              • {t}
            </Text>
          ))}
        </Section>
      ) : null}
    </View>
  );
}

function Section({ label, children }: { label: string; children: ReactNode }) {
  const { tokens } = useTheme();
  return (
    <View className="mt-4">
      <Text className="mb-1 text-[12px] font-semibold" style={{ color: tokens.textTer }}>
        {label}
      </Text>
      {children}
    </View>
  );
}
