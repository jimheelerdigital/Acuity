"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Comparisons card for the Insights page. Three groups — week vs week,
 * month vs month, since starting. Each delta renders with a directional
 * arrow + relative change copy. Keeps the copy unjudgmental —
 * "+3 sessions" not "up 60%" — because these are personal, not KPIs.
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
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/insights/comparisons");
      if (res.ok) setData(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading || !data) return null;

  const { thisWeekVsLast, thisMonthVsLast, sinceStarting } = data;
  const zeroActivity =
    sinceStarting.totalSessions === 0 &&
    thisWeekVsLast.thisWeek.sessions === 0 &&
    thisMonthVsLast.thisMonth.sessions === 0;

  if (zeroActivity) return null;

  return (
    <section className="mb-8 rounded-2xl border border-zinc-200 dark:border-white/10 bg-white dark:bg-[#1E1E2E] p-6 shadow-[0_1px_3px_rgba(0,0,0,0.04),0_4px_12px_rgba(0,0,0,0.04)] dark:shadow-none dark:ring-1 dark:ring-white/5">
      <h2 className="text-xs font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500 mb-4">
        Compared to before
      </h2>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
        <ComparisonGroup
          label="This week"
          subLabel="vs last week"
          current={thisWeekVsLast.thisWeek}
          previous={thisWeekVsLast.lastWeek}
        />
        <ComparisonGroup
          label="This month"
          subLabel="vs last month"
          current={thisMonthVsLast.thisMonth}
          previous={thisMonthVsLast.lastMonth}
        />
        <SinceCard sinceStarting={sinceStarting} />
      </div>
    </section>
  );
}

function ComparisonGroup({
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
  const sessionDelta = current.sessions - previous.sessions;
  return (
    <div>
      <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">{label}</p>
      <p className="text-[11px] text-zinc-400 dark:text-zinc-500 mb-3">{subLabel}</p>

      <Stat
        label="Sessions"
        value={current.sessions}
        previous={previous.sessions}
        delta={sessionDelta}
      />
      <Stat
        label="Mood"
        value={current.moodAvg ?? "—"}
        previous={previous.moodAvg ?? "—"}
      />
      <Stat
        label="Top theme"
        value={current.topTheme ?? "—"}
        previous={previous.topTheme ?? "—"}
      />
    </div>
  );
}

function Stat({
  label,
  value,
  previous,
  delta,
}: {
  label: string;
  value: string | number;
  previous: string | number;
  delta?: number;
}) {
  let deltaEl = null;
  if (typeof delta === "number" && delta !== 0) {
    const up = delta > 0;
    deltaEl = (
      <span
        className={`ml-2 text-[11px] font-medium ${
          up ? "text-emerald-600 dark:text-emerald-400" : "text-zinc-400 dark:text-zinc-500"
        }`}
      >
        {up ? "↑" : "↓"} {Math.abs(delta)}
      </span>
    );
  }
  return (
    <div className="flex items-baseline justify-between py-1.5 border-b border-zinc-100 dark:border-white/5 last:border-b-0">
      <span className="text-xs text-zinc-500 dark:text-zinc-400">{label}</span>
      <div className="text-right">
        <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
          {value}
        </span>
        {deltaEl}
        {previous !== value && delta === undefined && (
          <div className="text-[10px] text-zinc-400 dark:text-zinc-500">
            was {String(previous)}
          </div>
        )}
      </div>
    </div>
  );
}

function SinceCard({
  sinceStarting,
}: {
  sinceStarting: Data["sinceStarting"];
}) {
  const since = sinceStarting.sinceDate
    ? new Date(sinceStarting.sinceDate).toLocaleDateString("en-US", {
        month: "short",
        year: "numeric",
      })
    : null;
  return (
    <div>
      <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Since joining</p>
      <p className="text-[11px] text-zinc-400 dark:text-zinc-500 mb-3">
        {since ?? "All-time"}
      </p>
      <div className="py-1.5 border-b border-zinc-100 dark:border-white/5">
        <div className="flex items-baseline justify-between">
          <span className="text-xs text-zinc-500 dark:text-zinc-400">Total sessions</span>
          <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
            {sinceStarting.totalSessions}
          </span>
        </div>
      </div>
      <div className="py-1.5 border-b border-zinc-100 dark:border-white/5">
        <div className="flex items-baseline justify-between">
          <span className="text-xs text-zinc-500 dark:text-zinc-400">Days journaled</span>
          <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
            {sinceStarting.daysJournaled}
          </span>
        </div>
      </div>
      <div className="py-1.5">
        <div className="flex items-baseline justify-between">
          <span className="text-xs text-zinc-500 dark:text-zinc-400">Longest streak</span>
          <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
            {sinceStarting.longestStreak}d
          </span>
        </div>
      </div>
    </div>
  );
}
