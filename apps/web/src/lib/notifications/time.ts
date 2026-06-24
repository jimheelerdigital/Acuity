import { formatInTimeZone } from "date-fns-tz";

import { DEFAULT_TIMEZONE } from "./constants";

/**
 * User-local time helpers for the notification scheduler. All entry/log
 * timestamps are UTC in Postgres; everything user-facing (quiet hours,
 * preferred hour, "today") is computed in the user's IANA timezone.
 */

export interface LocalParts {
  hour: number; // 0–23
  minute: number; // 0–59
  day: string; // "YYYY-MM-DD" in tz
}

export function resolveTimezone(
  prefsTz: string | null | undefined,
  userTz: string | null | undefined
): string {
  return prefsTz || userTz || DEFAULT_TIMEZONE;
}

export function localParts(now: Date, tz: string): LocalParts {
  // formatInTimeZone is the same date-fns-tz helper lib/streak.ts uses.
  return {
    hour: Number(formatInTimeZone(now, tz, "H")),
    minute: Number(formatInTimeZone(now, tz, "m")),
    day: formatInTimeZone(now, tz, "yyyy-MM-dd"),
  };
}

/** Minutes-since-midnight for an "HH:MM" string (returns null if malformed). */
function hhmmToMinutes(hhmm: string): number | null {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(hhmm);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

/**
 * True if the user-local time is inside [start, end). Wraps midnight when
 * end <= start (e.g. 21:00 → 09:00 spans the night). Malformed bounds → not
 * quiet (fail open to "send-allowed" rather than silently muting forever).
 */
export function inQuietHours(
  parts: LocalParts,
  start: string,
  end: string
): boolean {
  const s = hhmmToMinutes(start);
  const e = hhmmToMinutes(end);
  if (s === null || e === null) return false;
  const t = parts.hour * 60 + parts.minute;
  if (s === e) return false; // empty window
  if (s < e) return t >= s && t < e; // same-day window
  return t >= s || t < e; // wraps midnight
}
