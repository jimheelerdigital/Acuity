import {
  currentStreak,
  bestStreak,
  completionRate,
  type HabitLike,
} from "@acuity/shared";

/**
 * Web habits client — the browser-side twin of apps/mobile/lib/habits-api.ts.
 *
 * Streaks are computed HERE from the checks the server returns, using the
 * SHARED implementation (@acuity/shared/habits), so web and mobile can never
 * disagree about a streak. The server deliberately does not compute them: it
 * doesn't reliably know the user's local calendar day.
 *
 * Auth is the NextAuth cookie — same-origin fetch sends it automatically, and
 * the API's getAnySessionUserId() falls back to the cookie session. No bearer
 * token is needed on web.
 */

export interface Habit extends HabitLike {
  id: string;
  name: string;
  /** Optional free-text notes (what the habit involves). May be null. */
  description: string | null;
  /** "standard" | "reflection". The reflection habit self-completes on record. */
  type: string;
  daysActive: number[];
  archivedAt: string | null;
  sortOrder: number;
  createdAt: string;
}

export const REFLECTION_HABIT_TYPE = "reflection";
export const REFLECTION_HABIT_NAME = "Daily Reflection with Ripple";

export function isReflectionHabit(h: Pick<Habit, "type">): boolean {
  return h.type === REFLECTION_HABIT_TYPE;
}

export interface HabitCheckRow {
  habitId: string;
  localDate: string;
}

export interface HabitsPayload {
  habits: Habit[];
  checks: HabitCheckRow[];
}

/** Today's date in the BROWSER's local zone, as YYYY-MM-DD. */
export function todayLocalDate(now: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

// ─── Low-level fetch helpers ─────────────────────────────────────────
// Same-origin JSON calls. We throw the server's error message when present
// so callers (e.g. the at-cap create) can surface it verbatim.

async function readError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: unknown };
    if (typeof body?.error === "string") return body.error;
  } catch {
    // no JSON body — fall through to a generic message
  }
  return `Request failed (${res.status})`;
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    method: "GET",
    headers: { accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(await readError(res));
  return (await res.json()) as T;
}

async function sendJson<T>(
  url: string,
  method: "POST" | "PATCH" | "DELETE",
  body?: unknown
): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: {
      accept: "application/json",
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(await readError(res));
  return (await res.json()) as T;
}

// ─── API surface (mirrors mobile habits-api.ts) ──────────────────────

export async function fetchHabits(): Promise<HabitsPayload> {
  const res = await getJson<HabitsPayload>("/api/habits");
  return { habits: res?.habits ?? [], checks: res?.checks ?? [] };
}

/** Archived (soft-deleted) habits, most-recently-archived first, + checks. */
export async function fetchArchivedHabits(): Promise<HabitsPayload> {
  const res = await getJson<HabitsPayload>("/api/habits?archived=1");
  return { habits: res?.habits ?? [], checks: res?.checks ?? [] };
}

export async function createHabit(
  name: string,
  daysActive?: number[],
  type?: string
): Promise<Habit | null> {
  const res = await sendJson<{ habit: Habit }>("/api/habits", "POST", {
    name,
    ...(daysActive ? { daysActive } : {}),
    ...(type ? { type } : {}),
  });
  return res?.habit ?? null;
}

export async function setHabitCheck(
  habitId: string,
  checked: boolean,
  localDate: string = todayLocalDate()
): Promise<boolean> {
  const res = await sendJson<{ ok: boolean }>(
    `/api/habits/${habitId}/check`,
    "POST",
    { localDate, checked }
  );
  return !!res?.ok;
}

/**
 * Rename, change active days (empty daysActive = paused), and/or set the
 * description. Pass description: "" to clear it.
 */
export async function updateHabit(
  id: string,
  fields: { name?: string; daysActive?: number[]; description?: string }
): Promise<Habit | null> {
  const res = await sendJson<{ habit: Habit }>(
    `/api/habits/${id}`,
    "PATCH",
    fields
  );
  return res?.habit ?? null;
}

/** Archive (soft delete). Check history is kept server-side. */
export async function archiveHabit(id: string): Promise<boolean> {
  const res = await sendJson<{ ok: boolean }>(`/api/habits/${id}`, "DELETE");
  return !!res?.ok;
}

/**
 * Restore (unarchive) a previously deleted habit. Throws the server's message
 * when it can't (e.g. at the active-habit cap) so the caller can surface it.
 */
export async function unarchiveHabit(id: string): Promise<Habit | null> {
  const res = await sendJson<{ habit: Habit }>(`/api/habits/${id}`, "PATCH", {
    archived: false,
  });
  return res?.habit ?? null;
}

// ─── Streak / stats helpers (shared math) ────────────────────────────

/** Index checks by habit id → set of YYYY-MM-DD, for streak math. */
export function checksByHabit(
  checks: HabitCheckRow[]
): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();
  for (const c of checks) {
    let set = map.get(c.habitId);
    if (!set) {
      set = new Set();
      map.set(c.habitId, set);
    }
    set.add(c.localDate);
  }
  return map;
}

export function streakFor(
  habit: Habit,
  checks: Map<string, Set<string>>,
  today: string = todayLocalDate()
): number {
  return currentStreak(habit, checks.get(habit.id) ?? new Set(), today);
}

/** Current + best streak and 30-day completion rate for one habit. */
export function statsFor(
  habit: Habit,
  checkSet: ReadonlySet<string>,
  today: string = todayLocalDate()
): {
  current: number;
  best: number;
  rate: { done: number; expected: number; pct: number };
} {
  return {
    current: currentStreak(habit, checkSet, today),
    best: bestStreak(habit, checkSet, today),
    rate: completionRate(habit, checkSet, today, 30),
  };
}
