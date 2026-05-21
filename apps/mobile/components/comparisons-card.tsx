import { useCallback, useEffect, useState } from "react";
import { Text, View } from "react-native";

import { useTheme } from "@/contexts/theme-context";
import { api } from "@/lib/api";

/**
 * Mobile counterpart to apps/web/src/components/comparisons-card.tsx.
 * Same shape + endpoint; just renders with RN primitives.
 */

type WindowStats = {
  sessions: number;
  moodAvg: string | null;
  topTheme: string | null;
};

type Data = {
  thisWeekVsLast: { thisWeek: WindowStats; lastWeek: WindowStats };
  thisMonthVsLast: { thisMonth: WindowStats; lastMonth: WindowStats };
  sinceStarting: {
    totalSessions: number;
    daysJournaled: number;
    longestStreak: number;
    sinceDate: string | null;
  };
};

export function ComparisonsCard() {
  const { tokens } = useTheme();
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const d = await api.get<Data>("/api/insights/comparisons");
      setData(d);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading || !data) return null;

  const { thisWeekVsLast, thisMonthVsLast, sinceStarting } = data;
  if (sinceStarting.totalSessions === 0) return null;

  return (
    <View
      className="mb-6 rounded-2xl border p-4"
      style={{ borderColor: tokens.line, backgroundColor: tokens.cardBg }}
    >
      <Text
        className="mb-3 text-xs font-semibold uppercase tracking-widest"
        style={{ color: tokens.textTer }}
      >
        Compared to before
      </Text>

      <Group
        label="This week"
        subLabel="vs last week"
        current={thisWeekVsLast.thisWeek}
        previous={thisWeekVsLast.lastWeek}
      />
      <Separator />
      <Group
        label="This month"
        subLabel="vs last month"
        current={thisMonthVsLast.thisMonth}
        previous={thisMonthVsLast.lastMonth}
      />
      <Separator />
      <View>
        <Text
          className="text-sm font-semibold"
          style={{ color: tokens.text }}
        >
          Since joining
        </Text>
        <Text
          className="text-[11px] mb-2"
          style={{ color: tokens.textTer }}
        >
          All-time
        </Text>
        <Row label="Total sessions" value={String(sinceStarting.totalSessions)} />
        <Row label="Days journaled" value={String(sinceStarting.daysJournaled)} />
        <Row label="Longest streak" value={`${sinceStarting.longestStreak}d`} />
      </View>
    </View>
  );
}

function Group({
  label,
  subLabel,
  current,
  previous,
}: {
  label: string;
  subLabel: string;
  current: WindowStats;
  previous: WindowStats;
}) {
  const { tokens } = useTheme();
  const sessionDelta = current.sessions - previous.sessions;
  return (
    <View className="mb-3">
      <Text className="text-sm font-semibold" style={{ color: tokens.text }}>
        {label}
      </Text>
      <Text className="text-[11px] mb-2" style={{ color: tokens.textTer }}>
        {subLabel}
      </Text>
      <Row
        label="Sessions"
        value={String(current.sessions)}
        deltaNumber={sessionDelta !== 0 ? sessionDelta : undefined}
      />
      <Row label="Mood" value={current.moodAvg ?? "—"} />
      <Row label="Top theme" value={current.topTheme ?? "—"} />
    </View>
  );
}

function Row({
  label,
  value,
  deltaNumber,
}: {
  label: string;
  value: string;
  deltaNumber?: number;
}) {
  const { tokens } = useTheme();
  return (
    <View className="flex-row items-baseline justify-between py-1">
      <Text className="text-xs" style={{ color: tokens.textSec }}>
        {label}
      </Text>
      <View className="flex-row items-baseline gap-1.5">
        <Text className="text-sm font-medium" style={{ color: tokens.text }}>
          {value}
        </Text>
        {deltaNumber !== undefined && (
          <Text
            className="text-[11px] font-medium"
            style={{
              color: deltaNumber > 0 ? tokens.good : tokens.textTer,
            }}
          >
            {deltaNumber > 0 ? "↑" : "↓"} {Math.abs(deltaNumber)}
          </Text>
        )}
      </View>
    </View>
  );
}

function Separator() {
  const { tokens } = useTheme();
  return (
    <View
      className="my-2 h-px"
      style={{ backgroundColor: tokens.line }}
    />
  );
}
