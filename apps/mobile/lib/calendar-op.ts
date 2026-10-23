/**
 * Pure mapping from a server calendar op (GET /api/integrations/calendar/drain,
 * shape = CalendarSyncOp in apps/web/src/lib/calendar-sync.ts) to the event
 * written on the phone. No React Native imports, so the web vitest suite
 * covers it.
 */

export type DrainOp = {
  taskId: string;
  kind: "upsert" | "complete" | "delete";
  providerEventId: string | null;
  targetCalendarId: string;
  taskTitle: string;
  dueDateISO: string | null;
  duration: "ALL_DAY" | "TIMED";
};

export type PlannedEvent = { title: string; start: Date; end: Date; allDay: boolean };

/** Timed task events start at this local hour and last an hour. */
export const TIMED_START_HOUR = 9;

export function eventTitle(taskTitle: string, done: boolean): string {
  return `${done ? "✓ " : ""}Ripple: ${taskTitle}`;
}

/**
 * Due dates are calendar days (the app sends YYYY-MM-DD; the server stores
 * midnight UTC). Read the day from the ISO string itself, never through a
 * timezone conversion, or US users would see the task a day early.
 */
export function localDayFromISO(iso: string): { y: number; m: number; d: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!match) return null;
  return { y: Number(match[1]), m: Number(match[2]) - 1, d: Number(match[3]) };
}

export function plannedEventFor(op: DrainOp): PlannedEvent | null {
  if (!op.dueDateISO) return null;
  const day = localDayFromISO(op.dueDateISO);
  if (!day) return null;
  const title = eventTitle(op.taskTitle, op.kind === "complete");
  if (op.duration === "ALL_DAY") {
    const start = new Date(day.y, day.m, day.d, 0, 0, 0);
    const end = new Date(day.y, day.m, day.d + 1, 0, 0, 0);
    return { title, start, end, allDay: true };
  }
  const start = new Date(day.y, day.m, day.d, TIMED_START_HOUR, 0, 0);
  const end = new Date(day.y, day.m, day.d, TIMED_START_HOUR + 1, 0, 0);
  return { title, start, end, allDay: false };
}
