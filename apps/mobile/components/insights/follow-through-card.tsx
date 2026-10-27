import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";

import { useTheme } from "@/contexts/theme-context";
import { api } from "@/lib/api";

/**
 * FollowThroughCard (Insights, 2026-10-27): what you said you'd do vs what
 * got done. Data from GET /api/insights/follow-through
 * (apps/web/src/lib/follow-through.ts holds the logic and thresholds).
 * Self-contained: fetches its own data and renders nothing on loading,
 * error, or when the server returns { report: null } (fewer than 3 tasks
 * captured in the last 14 days). Not Pro-gated: tasks are core.
 */

type WeekStats = { captured: number; fromRecordings: number; completed: number };
type Report = {
  thisWeek: WeekStats;
  lastWeek: WeekStats;
  groupSpeed: { group: string; medianDays: number; completed: number }[];
  stillOpen: {
    kind: "repeated" | "oldest" | "none";
    items: { id: string; title: string; mentions: number; ageDays: number }[];
  };
};

function daysLabel(d: number): string {
  if (d < 1) return "same day";
  const r = Math.round(d);
  return `${r} day${r === 1 ? "" : "s"}`;
}

export function FollowThroughCard() {
  const { tokens } = useTheme();
  const router = useRouter();
  const [report, setReport] = useState<Report | null>(null);

  const load = useCallback(async () => {
    try {
      const d = await api.get<{ report: Report | null }>("/api/insights/follow-through");
      setReport(d.report);
    } catch {
      // silent: the card simply doesn't render
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (!report) return null;
  const { thisWeek, lastWeek, groupSpeed, stillOpen } = report;
  const completedDelta = thisWeek.completed - lastWeek.completed;

  return (
    <View
      className="mb-6 rounded-2xl border p-4"
      style={{ borderColor: tokens.line, backgroundColor: tokens.cardBg }}
    >
      <Text
        className="mb-1 text-xs font-semibold uppercase tracking-widest"
        style={{ color: tokens.textTer }}
      >
        Follow-through
      </Text>
      <Text className="mb-3 text-[11px]" style={{ color: tokens.textTer }}>
        Last 7 days vs the 7 before
      </Text>

      <Row
        label="Tasks captured"
        value={String(thisWeek.captured)}
        sub={
          thisWeek.fromRecordings > 0
            ? `${thisWeek.fromRecordings} from your debriefs`
            : undefined
        }
      />
      <Row
        label="Tasks done"
        value={String(thisWeek.completed)}
        delta={completedDelta !== 0 ? completedDelta : undefined}
      />

      {groupSpeed.length > 0 && (
        <>
          <Separator />
          <Text className="mb-1 text-sm font-semibold" style={{ color: tokens.text }}>
            Typical time to finish
          </Text>
          {groupSpeed.map((g) => (
            <Row key={g.group} label={g.group} value={daysLabel(g.medianDays)} />
          ))}
        </>
      )}

      {stillOpen.kind !== "none" && stillOpen.items.length > 0 && (
        <>
          <Separator />
          <Text className="text-sm font-semibold" style={{ color: tokens.text }}>
            {stillOpen.kind === "repeated" ? "Keeps coming up" : "Waiting the longest"}
          </Text>
          <Text className="mb-1 text-[11px]" style={{ color: tokens.textTer }}>
            {stillOpen.kind === "repeated"
              ? "Still open, and mentioned in more than one debrief"
              : "Open tasks from your debriefs"}
          </Text>
          {stillOpen.items.map((t) => (
            <Pressable
              key={t.id}
              onPress={() => router.push(`/task/${t.id}` as never)}
              accessibilityRole="button"
              accessibilityLabel={`Open task: ${t.title}`}
              className="flex-row items-baseline justify-between py-1"
            >
              <Text
                className="mr-3 flex-1 text-xs"
                numberOfLines={1}
                style={{ color: tokens.textSec }}
              >
                {t.title}
              </Text>
              <Text className="text-[11px]" style={{ color: tokens.textTer }}>
                {stillOpen.kind === "repeated"
                  ? `${t.mentions} debriefs`
                  : `${t.ageDays}d`}
              </Text>
            </Pressable>
          ))}
        </>
      )}
    </View>
  );
}

function Row({
  label,
  value,
  sub,
  delta,
}: {
  label: string;
  value: string;
  sub?: string;
  delta?: number;
}) {
  const { tokens } = useTheme();
  return (
    <View className="py-1">
      <View className="flex-row items-baseline justify-between">
        <Text className="text-xs" style={{ color: tokens.textSec }}>
          {label}
        </Text>
        <View className="flex-row items-baseline gap-1.5">
          <Text className="text-sm font-medium" style={{ color: tokens.text }}>
            {value}
          </Text>
          {delta !== undefined && (
            <Text
              className="text-[11px] font-medium"
              style={{ color: delta > 0 ? tokens.good : tokens.textTer }}
            >
              {delta > 0 ? "↑" : "↓"} {Math.abs(delta)}
            </Text>
          )}
        </View>
      </View>
      {sub && (
        <Text className="text-[11px]" style={{ color: tokens.textTer }}>
          {sub}
        </Text>
      )}
    </View>
  );
}

function Separator() {
  const { tokens } = useTheme();
  return <View className="my-2 h-px" style={{ backgroundColor: tokens.line }} />;
}
