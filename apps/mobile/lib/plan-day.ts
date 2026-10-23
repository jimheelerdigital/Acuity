/**
 * Plan my day (1.9.6) — the scheduler. Pure (no React Native imports) so the
 * web vitest suite covers it.
 *
 * Takes today's pressing tasks (the same list as the Home TODAY card:
 * overdue → due today → high priority with no date, lib/today-tasks.ts) and
 * the busy times on the phone's calendar, and fits each task into the
 * earliest free gap inside the workday. Tasks are placed in priority order;
 * a later, shorter task can still take an earlier gap a longer one didn't
 * fit. Anything that doesn't fit before the workday ends is returned as
 * `unscheduled` so the preview can say so.
 *
 * Busy = the person's timed events. All-day events don't block time, and
 * Ripple's own task events ("Ripple: …") are tasks, not meetings.
 */
import type { TodayBucket, TodayTask, TodayTaskInput } from "./today-tasks";

export type BusyEvent = {
  title: string;
  start: string | Date;
  end: string | Date;
  allDay: boolean;
};

export type Interval = { start: number; end: number };

export type PlanSettings = {
  /** Local hour the workday starts (0–23). */
  startHour: number;
  /** Local hour the workday ends (1–24), after startHour. */
  endHour: number;
};

export const DEFAULT_PLAN_SETTINGS: PlanSettings = { startHour: 9, endHour: 18 };
export const DEFAULT_BLOCK_MINUTES = 30;
export const BLOCK_MINUTE_CHOICES = [15, 30, 45, 60, 90] as const;
/** Blocks start on quarter hours. */
export const SLOT_MINUTES = 15;

const MIN = 60 * 1000;

export type PlannedBlock<T extends TodayTaskInput = TodayTaskInput> = {
  task: T;
  bucket: TodayBucket;
  start: Date;
  end: Date;
  minutes: number;
};

export type DayPlan<T extends TodayTaskInput = TodayTaskInput> = {
  blocks: PlannedBlock<T>[];
  unscheduled: TodayTask<T>[];
  /** The window actually planned (workday, starting no earlier than now). */
  window: { start: Date; end: Date } | null;
};

const RIPPLE_TITLE = /^(✓ )?Ripple: /;

/** Timed, non-Ripple events → merged busy intervals (ms), sorted. */
export function busyIntervals(events: readonly BusyEvent[]): Interval[] {
  const raw: Interval[] = [];
  for (const e of events) {
    if (e.allDay || RIPPLE_TITLE.test(e.title)) continue;
    const start = new Date(e.start).getTime();
    const end = new Date(e.end).getTime();
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue;
    raw.push({ start, end });
  }
  raw.sort((a, b) => a.start - b.start);
  const merged: Interval[] = [];
  for (const i of raw) {
    const last = merged[merged.length - 1];
    if (last && i.start <= last.end) last.end = Math.max(last.end, i.end);
    else merged.push({ ...i });
  }
  return merged;
}

/** Round up to the next slot boundary (local clock; slots divide an hour). */
export function roundUpToSlot(ms: number, slotMinutes = SLOT_MINUTES): number {
  const d = new Date(ms);
  const mins = d.getMinutes() + d.getSeconds() / 60 + d.getMilliseconds() / 60000;
  const up = Math.ceil(mins / slotMinutes - 1e-9) * slotMinutes;
  d.setMinutes(0, 0, 0);
  return d.getTime() + up * MIN;
}

export function planWindow(now: Date, s: PlanSettings): { start: Date; end: Date } | null {
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), s.startHour, 0, 0, 0);
  const dayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), s.endHour, 0, 0, 0);
  const start = Math.max(dayStart.getTime(), roundUpToSlot(now.getTime()));
  if (start >= dayEnd.getTime()) return null;
  return { start: new Date(start), end: dayEnd };
}

/**
 * Fit tasks (already in priority order) into free time.
 * `minutesFor` lets the preview change one block's length.
 */
export function planDay<T extends TodayTaskInput>(
  tasks: readonly TodayTask<T>[],
  busy: readonly Interval[],
  opts: {
    now: Date;
    settings?: PlanSettings;
    minutesFor?: (taskId: string) => number | undefined;
  }
): DayPlan<T> {
  const settings = opts.settings ?? DEFAULT_PLAN_SETTINGS;
  const window = planWindow(opts.now, settings);
  if (!window) return { blocks: [], unscheduled: [...tasks], window: null };

  const taken: Interval[] = busy.map((b) => ({ ...b }));
  const blocks: PlannedBlock<T>[] = [];
  const unscheduled: TodayTask<T>[] = [];
  const winEnd = window.end.getTime();

  for (const t of tasks) {
    const minutes = opts.minutesFor?.(t.task.id) ?? DEFAULT_BLOCK_MINUTES;
    const len = minutes * MIN;
    let candidate = window.start.getTime();
    let placed = false;
    // Each pass either places the block or jumps past one conflict, so this
    // ends within (taken.length + 1) passes.
    for (let guard = 0; guard <= taken.length + 1; guard++) {
      if (candidate + len > winEnd) break;
      const clash = taken.find((i) => i.start < candidate + len && i.end > candidate);
      if (!clash) {
        blocks.push({
          task: t.task,
          bucket: t.bucket,
          start: new Date(candidate),
          end: new Date(candidate + len),
          minutes,
        });
        taken.push({ start: candidate, end: candidate + len });
        placed = true;
        break;
      }
      candidate = roundUpToSlot(clash.end);
    }
    if (!placed) unscheduled.push(t);
  }

  blocks.sort((a, b) => a.start.getTime() - b.start.getTime());
  return { blocks, unscheduled, window };
}

/** Next length in the duration chip cycle. */
export function nextBlockMinutes(current: number): number {
  const i = BLOCK_MINUTE_CHOICES.indexOf(current as (typeof BLOCK_MINUTE_CHOICES)[number]);
  return BLOCK_MINUTE_CHOICES[(i + 1) % BLOCK_MINUTE_CHOICES.length];
}

export function clampSettings(s: PlanSettings): PlanSettings {
  const startHour = Math.min(22, Math.max(0, Math.round(s.startHour)));
  const endHour = Math.min(24, Math.max(startHour + 1, Math.round(s.endHour)));
  return { startHour, endHour };
}
