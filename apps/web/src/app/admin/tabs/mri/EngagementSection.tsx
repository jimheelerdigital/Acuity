"use client";

import { useEffect, useRef, useState } from "react";

import ChartCard from "../../components/ChartCard";
import MetricCard from "../../components/MetricCard";
import { SkeletonTable } from "../../components/SkeletonCard";
import type { EngagementResponse, RetentionWeek } from "@/lib/mri/types";

interface Props {
  start: string;
  end: string;
}

// One-and-done / dabbled / engaged / habit cohort bands, each with a fixed
// color so the stacked bar reads at a glance: red = churned-on-arrival,
// amber = shallow, blue = engaged, purple = habit (the goal state).
const COHORT_BANDS: {
  key: "oneAndDone" | "dabbled" | "engaged" | "habit";
  label: string;
  color: string;
}[] = [
  { key: "oneAndDone", label: "One & done (1 entry)", color: "var(--acuity-bad)" },
  { key: "dabbled", label: "Dabbled (2-4)", color: "var(--acuity-warn)" },
  { key: "engaged", label: "Engaged (5-14)", color: "var(--acuity-secondary)" },
  { key: "habit", label: "Habit (15+)", color: "var(--acuity-primary)" },
];

function retentionColor(pct: number): string {
  if (pct >= 40) return "bg-acuity-good";
  if (pct >= 20) return "bg-acuity-warn";
  return "bg-acuity-bad";
}

export default function EngagementSection({ start, end }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [inView, setInView] = useState(false);
  const [data, setData] = useState<EngagementResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Lazy gate: only fetch once this section scrolls into view.
  useEffect(() => {
    const el = containerRef.current;
    if (!el || inView) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setInView(true);
          observer.disconnect();
        }
      },
      { rootMargin: "200px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [inView]);

  useEffect(() => {
    if (!inView) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    const url = `/api/admin/mri?section=engagement&start=${encodeURIComponent(
      start,
    )}&end=${encodeURIComponent(end)}`;
    fetch(url)
      .then(async (res) => {
        if (!res.ok) throw new Error(`Request failed (${res.status})`);
        return (await res.json()) as EngagementResponse;
      })
      .then((json) => {
        if (!cancelled) setData(json);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Failed to load engagement data",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [inView, start, end]);

  const dist = data?.distribution ?? null;
  const cohorts = dist?.cohorts ?? null;
  const totalActivated = dist?.totalActivated ?? 0;
  const retentionCurve: RetentionWeek[] = data?.retentionCurve ?? [];

  const bands = COHORT_BANDS.map((b) => ({
    ...b,
    count: cohorts?.[b.key] ?? 0,
  }));
  const bandsTotal = bands.reduce((acc, b) => acc + b.count, 0);

  return (
    <div ref={containerRef} className="space-y-4">
      <ChartCard title="Engagement Distribution">
        {loading && !data ? (
          <SkeletonTable />
        ) : error ? (
          <p className="text-sm text-acuity-bad">{error}</p>
        ) : !dist || totalActivated === 0 ? (
          <p className="text-sm text-acuity-text-ter">
            No activated users in this range.
          </p>
        ) : (
          <div className="space-y-5">
            {/* Stacked cohort bar */}
            <div>
              <div className="mb-2 flex items-baseline justify-between text-sm">
                <span className="text-acuity-text-sec">
                  Cohort split of {totalActivated} activated users
                </span>
              </div>
              <div className="flex h-6 w-full overflow-hidden rounded-acuity-pill bg-acuity-bg-inset">
                {bands.map((b) => {
                  const widthPct =
                    bandsTotal > 0 ? (b.count / bandsTotal) * 100 : 0;
                  if (widthPct <= 0) return null;
                  return (
                    <div
                      key={b.key}
                      className="h-full transition-all"
                      style={{ width: `${widthPct}%`, backgroundColor: b.color }}
                      title={`${b.label}: ${b.count}`}
                    />
                  );
                })}
              </div>
              {/* Legend + per-band breakdown */}
              <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-4">
                {bands.map((b) => {
                  const pct =
                    bandsTotal > 0
                      ? ((b.count / bandsTotal) * 100).toFixed(1)
                      : "0.0";
                  return (
                    <div key={b.key} className="flex items-center gap-2 text-xs">
                      <span
                        className="inline-block h-2.5 w-2.5 rounded-sm"
                        style={{ backgroundColor: b.color }}
                      />
                      <span className="text-acuity-text-ter">{b.label}</span>
                      <span className="ml-auto tabular-nums text-acuity-text-sec">
                        {b.count}
                        <span className="ml-1 text-acuity-text-ter">({pct}%)</span>
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Supporting engagement stats */}
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <MetricCard
                label="Recorded 3+ Days"
                value={String(dist.recorded3PlusDays)}
              />
              <MetricCard
                label="Recorded 7+ Days"
                value={String(dist.recorded7PlusDays)}
              />
              <MetricCard
                label="Avg Entries / User"
                value={dist.avgEntriesPerUser.toFixed(1)}
              />
              <MetricCard
                label="Avg Days w/ Entries"
                value={dist.avgDaysWithEntries.toFixed(1)}
              />
            </div>
          </div>
        )}
      </ChartCard>

      <ChartCard title="12-Week Retention (trailing 90-day cohort)">
        {loading && !data ? (
          <SkeletonTable />
        ) : error ? (
          <p className="text-sm text-acuity-bad">{error}</p>
        ) : retentionCurve.length === 0 ? (
          <p className="text-sm text-acuity-text-ter">No retention data yet.</p>
        ) : (
          <div className="space-y-2">
            {retentionCurve.map((w) => {
              const widthPct = Math.max(w.pctRetained, 1.5);
              return (
                <div key={w.weekNum}>
                  <div className="mb-1 flex items-baseline justify-between text-xs">
                    <span className="text-acuity-text-sec">Week {w.weekNum}</span>
                    <span className="flex items-baseline gap-3 tabular-nums">
                      <span className="text-acuity-text-ter">
                        {w.activeInWeek}/{w.cohortSize}
                      </span>
                      <span className="font-medium text-acuity-text">
                        {w.pctRetained.toFixed(1)}%
                      </span>
                    </span>
                  </div>
                  <div className="h-3 w-full overflow-hidden rounded-acuity-pill bg-acuity-bg-inset">
                    <div
                      className={`h-full rounded-acuity-pill transition-all ${retentionColor(
                        w.pctRetained,
                      )}`}
                      style={{ width: `${Math.min(widthPct, 100)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </ChartCard>
    </div>
  );
}
