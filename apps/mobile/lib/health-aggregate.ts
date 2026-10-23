/**
 * Apple Health → daily snapshots (1.9.6). Pure (no React Native imports) so
 * the web vitest suite covers it.
 *
 * The phone reads HealthKit and sends one row per LOCAL day to
 * POST /api/health/snapshots: { date, steps, activeMinutes, sleepHours,
 * avgHRV }. Only these daily numbers leave the phone — no raw samples.
 *
 * Sleep: a night counts toward the day you woke up. iPhone and Apple Watch
 * often record the same sleep, so asleep intervals are merged before
 * summing (no double counting). In-bed and awake samples don't count.
 */
import { localYmd } from "./today-tasks";

export type HealthSnapshotRow = {
  date: string;
  steps: number | null;
  activeMinutes: number | null;
  sleepHours: number | null;
  avgHRV: number | null;
};

/** HealthKit sleep values that mean "asleep" (unspecified, core, deep, REM). */
export const ASLEEP_VALUES = new Set([1, 3, 4, 5]);

export type DailyStat = { startDate: Date | string; value: number | null | undefined };
export type SleepSample = { startDate: Date | string; endDate: Date | string; value: number };

/** The last `days` local days, oldest first, ending today. */
export function lastLocalDays(now: Date, days: number): string[] {
  const out: string[] = [];
  for (let i = days - 1; i >= 0; i--) {
    out.push(localYmd(new Date(now.getFullYear(), now.getMonth(), now.getDate() - i)));
  }
  return out;
}

/** Statistics-collection results (one per day) → ymd → value. */
export function byLocalDay(stats: readonly DailyStat[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const s of stats) {
    if (typeof s.value !== "number" || !Number.isFinite(s.value)) continue;
    m.set(localYmd(new Date(s.startDate)), s.value);
  }
  return m;
}

/** Asleep hours per wake-up day, overlapping sources merged. */
export function sleepHoursByDay(samples: readonly SleepSample[]): Map<string, number> {
  const asleep = samples
    .filter((s) => ASLEEP_VALUES.has(s.value))
    .map((s) => ({ start: new Date(s.startDate).getTime(), end: new Date(s.endDate).getTime() }))
    .filter((i) => Number.isFinite(i.start) && Number.isFinite(i.end) && i.end > i.start)
    .sort((a, b) => a.start - b.start);
  const merged: { start: number; end: number }[] = [];
  for (const i of asleep) {
    const last = merged[merged.length - 1];
    if (last && i.start <= last.end) last.end = Math.max(last.end, i.end);
    else merged.push({ ...i });
  }
  const m = new Map<string, number>();
  for (const i of merged) {
    const day = localYmd(new Date(i.end));
    m.set(day, (m.get(day) ?? 0) + (i.end - i.start) / 3_600_000);
  }
  return m;
}

/**
 * One row per day. Days with no data at all are left out (nothing to
 * say), and each metric is null when HealthKit had nothing for it — a
 * denied permission reads as "no data", never as zero.
 */
export function buildSnapshots(
  days: readonly string[],
  data: {
    steps: Map<string, number>;
    activeMinutes: Map<string, number>;
    sleepHours: Map<string, number>;
    hrv: Map<string, number>;
  }
): HealthSnapshotRow[] {
  const rows: HealthSnapshotRow[] = [];
  for (const date of days) {
    const steps = data.steps.get(date);
    const active = data.activeMinutes.get(date);
    const sleep = data.sleepHours.get(date);
    const hrv = data.hrv.get(date);
    if (steps === undefined && active === undefined && sleep === undefined && hrv === undefined) continue;
    rows.push({
      date,
      steps: steps === undefined ? null : Math.min(500_000, Math.max(0, Math.round(steps))),
      activeMinutes: active === undefined ? null : Math.min(1440, Math.max(0, Math.round(active))),
      sleepHours: sleep === undefined ? null : Math.min(24, Math.round(sleep * 100) / 100),
      avgHRV: hrv === undefined ? null : Math.min(500, Math.round(hrv * 10) / 10),
    });
  }
  return rows;
}
