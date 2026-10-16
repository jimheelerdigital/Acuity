/**
 * TODAY list (1.9.1) — the most pressing open tasks, for the Home card and
 * the "Today" home-screen widget.
 *
 * Rule (Jimmy, 2026-10-15): overdue first, then due today, then
 * high-priority tasks with no due date. Snoozed tasks are hidden.
 * Home shows the top 5.
 *
 * Dates: a task's dueDate is stored as UTC midnight of the chosen day
 * (the Tasks tab renders it with timeZone "UTC" for that reason), so its
 * calendar day is the first 10 chars of the ISO string. "Today" is the
 * user's LOCAL calendar day.
 *
 * The widget re-runs this same rule in Swift (targets/widget/index.swift,
 * `selectToday`) so the list rolls over correctly at midnight without the
 * app running. Keep the two in step.
 */

export type TodayTaskInput = {
  id: string;
  title: string | null;
  text: string | null;
  status: string;
  priority: string;
  dueDate: string | null;
  snoozedUntil: string | null;
};

export type TodayBucket = "overdue" | "today" | "priority";

export type TodayTask<T extends TodayTaskInput = TodayTaskInput> = {
  task: T;
  bucket: TodayBucket;
  /** YYYY-MM-DD or null. */
  dueYmd: string | null;
};

export const TODAY_LIMIT = 5;

const PRIORITY_RANK: Record<string, number> = {
  URGENT: 0,
  HIGH: 1,
  MEDIUM: 2,
  LOW: 3,
};

export function isHighPriority(priority: string): boolean {
  return priority === "URGENT" || priority === "HIGH";
}

export function localYmd(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function dueYmdOf(dueDate: string | null): string | null {
  if (!dueDate || dueDate.length < 10) return null;
  const ymd = dueDate.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(ymd) ? ymd : null;
}

/** Open = not done and not currently snoozed (an expired snooze is open). */
export function isOpenNow(t: TodayTaskInput, nowMs: number): boolean {
  if (t.status === "DONE") return false;
  if (t.status === "SNOOZED") {
    if (!t.snoozedUntil) return false;
    return new Date(t.snoozedUntil).getTime() <= nowMs;
  }
  return true;
}

/**
 * All pressing tasks in display order (callers slice to TODAY_LIMIT and
 * use the full length for "+N more").
 */
export function selectTodayTasks<T extends TodayTaskInput>(
  tasks: readonly T[],
  now: Date = new Date()
): TodayTask<T>[] {
  const nowMs = now.getTime();
  const today = localYmd(now);
  const out: TodayTask<T>[] = [];
  for (const task of tasks) {
    if (!isOpenNow(task, nowMs)) continue;
    const dueYmd = dueYmdOf(task.dueDate);
    let bucket: TodayBucket | null = null;
    if (dueYmd && dueYmd < today) bucket = "overdue";
    else if (dueYmd === today) bucket = "today";
    else if (!dueYmd && isHighPriority(task.priority)) bucket = "priority";
    if (bucket) out.push({ task, bucket, dueYmd });
  }
  const bucketRank: Record<TodayBucket, number> = {
    overdue: 0,
    today: 1,
    priority: 2,
  };
  out.sort((a, b) => {
    const br = bucketRank[a.bucket] - bucketRank[b.bucket];
    if (br !== 0) return br;
    // Oldest overdue first.
    if (a.bucket === "overdue" && a.dueYmd !== b.dueYmd) {
      return (a.dueYmd ?? "") < (b.dueYmd ?? "") ? -1 : 1;
    }
    const pr =
      (PRIORITY_RANK[a.task.priority] ?? 9) -
      (PRIORITY_RANK[b.task.priority] ?? 9);
    if (pr !== 0) return pr;
    return a.task.id < b.task.id ? -1 : a.task.id > b.task.id ? 1 : 0;
  });
  return out;
}

export function taskLabel(t: TodayTaskInput): string {
  return t.title ?? t.text ?? "Untitled task";
}
