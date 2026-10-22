import { Platform } from "react-native";
import { ExtensionStorage } from "@bacons/apple-targets";

import { currentStreak, isExpectedOn } from "@acuity/shared";
import { api } from "@/lib/api";
import { trackV10 } from "@/lib/onboarding-v10/analytics";
import { getCached, setCached } from "@/lib/cache";
import {
  checksByHabit,
  todayLocalDate,
  type Habit,
  type HabitCheckRow,
} from "@/lib/habits-api";
import { clearSiriUserData, publishSiriHabits } from "@/lib/siri-shortcuts-data";
import {
  dueYmdOf,
  isHighPriority,
  localYmd,
  taskLabel,
  type TodayTaskInput,
} from "@/lib/today-tasks";
import {
  clearAndroidWidget,
  publishAndroidWidget,
} from "@/lib/android-widget/update";

/**
 * Publishes the home-screen widget's data.
 *
 * iOS: into the shared App Group so the WidgetKit extension
 * (targets/widget) can read it. Serialization matches the widget's Swift
 * decode:
 *   streak      -> Int    (setInt)
 *   habitsToday -> [{name, done:0|1}] JSON (setArray)
 * After writing we ask WidgetKit to reload so the change shows promptly.
 *
 * Android: the same streak + today's habits go to the
 * react-native-android-widget snapshot (lib/android-widget), then every
 * placed Ripple widget is redrawn.
 */
const APP_GROUP = "group.com.heelerdigital.acuity";
const storage = Platform.OS === "ios" ? new ExtensionStorage(APP_GROUP) : null;

export function publishHabitsToWidget(
  habits: Habit[],
  checks: HabitCheckRow[]
): void {
  if (Platform.OS === "android") {
    try {
      const { streak, habitsToday, today } = computeWidgetData(habits, checks);
      void publishAndroidWidget({
        streak,
        habits: habitsToday.map((h) => ({ name: h.name, done: h.done === 1 })),
        localDate: today,
      }).catch(() => {});
    } catch {
      // Best-effort, same as iOS.
    }
    return;
  }
  if (!storage) return;
  try {
    const { streak, habitsToday } = computeWidgetData(habits, checks);
    storage.set("streak", streak);
    storage.set("habitsToday", habitsToday);
    storage.set("updatedAt", Date.now());
    ExtensionStorage.reloadWidget();
    // Also publish the full active-habit list (id + name) so the Siri
    // "check off <habit>" intent can resolve what the user says.
    publishSiriHabits(habits);
  } catch {
    // Widget data is best-effort; never let it break the app.
  }
}

/**
 * Streak + today's due habits — the numbers both platforms' widgets show.
 * Headline number = the best current streak among today's habits.
 */
function computeWidgetData(habits: Habit[], checks: HabitCheckRow[]) {
  const today = todayLocalDate();
  const byHabit = checksByHabit(checks);
  const due = habits.filter((h) => !h.archivedAt && isExpectedOn(h, today));
  const habitsToday = due.map((h) => ({
    name: h.name,
    done: byHabit.get(h.id)?.has(today) ? 1 : 0,
  }));
  const streak = due.reduce(
    (max, h) =>
      Math.max(max, currentStreak(h, byHabit.get(h.id) ?? new Set(), today)),
    0
  );
  return { today, habitsToday, streak };
}

/**
 * Sign-out: wipe the widget data so the next person on this device never
 * sees the previous user's habits on the home screen. Both platforms.
 */
export async function clearWidgetData(): Promise<void> {
  try {
    if (Platform.OS === "android") {
      await clearAndroidWidget();
      return;
    }
    if (!storage) return;
    storage.set("streak", 0);
    storage.set("habitsToday", []);
    storage.set("todayTasks", []);
    // Drop any widget check-offs that never reached the server: they
    // belong to the signed-out user and must not be flushed as the next one.
    storage.remove("pendingDone");
    // Struck-through "just completed" rows the widget keeps for undo.
    storage.remove("recentDone");
    // Siri's habit + task-group lists (siri-shortcuts-data.ts).
    clearSiriUserData();
    storage.set("updatedAt", Date.now());
    ExtensionStorage.reloadWidget();
  } catch {
    // Best-effort.
  }
}

/**
 * Publishes the resolved theme colors into the App Group so the phone-side
 * WatchConnectivity sender (plugins/RippleWatchConnectivity.swift) can hand them
 * to the watch. The watch uses these for its accent + the record orb gradient,
 * so changing palette on the phone reflects on the wrist. iOS only.
 * Hex strings (e.g. "#ED9672"); watch parses them. Note: watchOS has no light
 * mode, so only the accent/brand colors cross over — not a light/dark flip.
 */
export function publishThemeToWatch(theme: {
  primary: string;
  primaryHi: string;
  secondary: string;
  accent: string;
}): void {
  if (!storage) return;
  try {
    storage.set("themePrimary", theme.primary);
    storage.set("themePrimaryHi", theme.primaryHi);
    storage.set("themeSecondary", theme.secondary);
    storage.set("themeAccent", theme.accent);
  } catch {
    // Best-effort; never break the app over watch theming.
  }
}

/**
 * "Today" widget (1.9.1, filled out in 1.9.4). iOS only for now.
 *
 * Publishes open tasks so the widget can roll over at midnight and when a
 * snooze ends without the app running. The widget applies the same
 * pressing rule as lib/today-tasks.ts (`selectToday` in
 * targets/widget/index.swift): overdue → due today → high priority with no
 * date.
 *
 * DELIBERATE DIVERGENCE FROM HOME (1.9.4): Home's TODAY card stays
 * "pressing only" (Jimmy's rule, lib/today-tasks.ts header). The widget
 * additionally shows the REMAINING open tasks underneath, newest first, in
 * an "Open" bucket — most AI-extracted tasks are MEDIUM with no due date,
 * so a pressing-only widget was empty for most users. Pressing candidates
 * are always published first so the TODAY_WIDGET_MAX cap never drops one
 * in favour of a non-pressing task.
 *
 * App Group key `todayTasks` -> JSON array of
 *   { id, title, due: "YYYY-MM-DD" | "", high: 0|1, rank: 0..3|9,
 *     snoozedUntil: epoch seconds | 0, createdAt: epoch seconds | 0 }
 * plus `todayUpdatedAt` (ms). Sign-out clears it (clearWidgetData).
 *
 * The API origin the widget's tap-to-check intent calls is the existing
 * App Group key `apiBase`, published by lib/auth.ts (publishSiriConfig) on
 * every sign-in and cold-launch token hydrate — one key shared with the
 * Siri intents rather than a second copy here.
 */
const TODAY_WIDGET_MAX = 40;
const TODAY_HORIZON_DAYS = 14;
const RANK: Record<string, number> = { URGENT: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };

type TodayWidgetItem = {
  id: string;
  title: string;
  due: string;
  high: number;
  rank: number;
  snoozedUntil: number;
  createdAt: number;
};

function epochSeconds(iso: string | null | undefined): number {
  if (!iso) return 0;
  const ms = new Date(iso).getTime();
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : 0;
}

export function publishTodayToWidget(tasks: readonly TodayTaskInput[]): void {
  if (!storage) return;
  try {
    const now = new Date();
    const horizon = localYmd(
      new Date(now.getTime() + TODAY_HORIZON_DAYS * 24 * 60 * 60 * 1000)
    );
    const pressing: TodayWidgetItem[] = [];
    const open: TodayWidgetItem[] = [];
    for (const t of tasks) {
      if (t.status === "DONE") continue;
      const due = dueYmdOf(t.dueDate);
      const high = isHighPriority(t.priority);
      let snoozedUntil = 0;
      if (t.status === "SNOOZED") {
        const ms = t.snoozedUntil ? new Date(t.snoozedUntil).getTime() : NaN;
        if (!Number.isFinite(ms)) continue; // snoozed with no end: hidden
        if (ms > now.getTime()) snoozedUntil = Math.floor(ms / 1000);
      }
      const item: TodayWidgetItem = {
        id: t.id,
        title: taskLabel(t).slice(0, 120),
        due: due ?? "",
        high: high ? 1 : 0,
        rank: RANK[t.priority] ?? 9,
        snoozedUntil,
        createdAt: epochSeconds(t.createdAt),
      };
      // Pressing within the horizon vs. everything else that's open.
      if (due ? due <= horizon : high) pressing.push(item);
      else open.push(item);
    }
    open.sort((a, b) => b.createdAt - a.createdAt || (a.id < b.id ? -1 : 1));
    const items: Record<string, string | number>[] = [
      ...pressing,
      ...open,
    ].slice(0, TODAY_WIDGET_MAX);
    storage.set("todayTasks", items);
    storage.set("todayUpdatedAt", Date.now());
    ExtensionStorage.reloadWidget("RippleTodayWidget");
    reportWidgetPublish(items.length, pressing.length);
  } catch (err) {
    // Widget data is best-effort; never let it break the app — but do say
    // so, or an empty widget is undiagnosable from the outside.
    trackV10("v10_widget_published", {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Diagnostic (1.9.4): after writing `todayTasks`, read it back through the
 * same native module the widget's container is served from and report what
 * landed. The 1.9.3 widget looked "broken" for weeks because its extension
 * had no App Group entitlement and nothing on the server could tell us
 * whether the app had written anything. Throttled to one event per minute
 * per process; the payload is counts only, never task text.
 */
let lastWidgetReportAt = 0;
function reportWidgetPublish(written: number, pressing: number): void {
  const now = Date.now();
  if (now - lastWidgetReportAt < 60_000) return;
  lastWidgetReportAt = now;
  let readBack: number | null = null;
  try {
    const raw = storage?.get("todayTasks");
    if (typeof raw === "string") {
      const parsed = JSON.parse(raw) as unknown;
      readBack = Array.isArray(parsed) ? parsed.length : -1;
    }
  } catch {
    readBack = -2;
  }
  trackV10("v10_widget_published", { ok: true, written, pressing, read_back: readBack });
}

// ─── Widget tap-to-check reconciliation (1.9.4) ─────────────────────
//
// The widget's CompleteTaskIntent is optimistic: it appends the task id to
// the App Group key `pendingDone` (JSON string array) BEFORE calling
// PATCH /api/tasks, and removes it only on a 2xx. So an id still in
// `pendingDone` means "the user checked this off on the widget but the
// server may not know yet" (no network, expired token, intent killed).
// The app is the retry path: on foreground / Tasks focus it PATCHes each
// pending id and clears them, and meanwhile treats them as DONE so Home,
// the Tasks tab and the widget all agree.

const PENDING_DONE_KEY = "pendingDone";
const TASKS_CACHE_KEY = "/api/tasks?all=1";

/** Ids the widget has checked off that the server may not have yet. */
export function readPendingWidgetCompletions(): string[] {
  if (!storage) return [];
  try {
    const raw = storage.get(PENDING_DONE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((x): x is string => typeof x === "string")
      : [];
  } catch {
    return [];
  }
}

function writePendingWidgetCompletions(ids: string[]): void {
  if (!storage) return;
  try {
    storage.set(PENDING_DONE_KEY, JSON.stringify(ids));
  } catch {
    // best-effort
  }
}

/**
 * Overlay widget completions onto a task list so the app renders them as
 * DONE before the flush has reached the server. Pure; returns the same
 * array when there is nothing pending.
 */
export function applyPendingWidgetCompletions<
  T extends { id: string; status: string },
>(tasks: readonly T[]): T[] {
  const pending = readPendingWidgetCompletions();
  if (pending.length === 0) return tasks as T[];
  const set = new Set(pending);
  let changed = false;
  const out = tasks.map((t) => {
    if (t.status !== "DONE" && set.has(t.id)) {
      changed = true;
      return { ...t, status: "DONE" };
    }
    return t;
  });
  return changed ? out : (tasks as T[]);
}

let flushInFlight: Promise<number> | null = null;

/**
 * PATCH every `pendingDone` id as complete, clear the ones that succeed,
 * mark them DONE in the shared tasks cache, and re-publish the widget.
 * Resolves with the number of ids flushed. Safe to call often: concurrent
 * calls share one run, and an empty queue is a no-op.
 */
export function flushWidgetCompletions(): Promise<number> {
  if (!storage) return Promise.resolve(0);
  if (flushInFlight) return flushInFlight;
  flushInFlight = (async () => {
    const pending = readPendingWidgetCompletions();
    if (pending.length === 0) return 0;
    const done: string[] = [];
    for (const id of pending) {
      try {
        await api.patch("/api/tasks", { id, action: "complete" });
        done.push(id);
      } catch (err) {
        // A 404 means the task is gone (deleted elsewhere) — nothing left
        // to complete, so stop retrying it. Anything else stays queued.
        if ((err as { status?: number })?.status === 404) done.push(id);
      }
    }
    if (done.length === 0) return 0;
    const doneSet = new Set(done);
    writePendingWidgetCompletions(pending.filter((id) => !doneSet.has(id)));
    // Keep the shared cache truthful so the next publish (and Home / the
    // Tasks tab) don't resurrect a task the server now has as DONE.
    const cached = getCached<{ tasks: TodayTaskInput[] }>(TASKS_CACHE_KEY);
    if (cached) {
      const tasks = cached.tasks.map((t) =>
        doneSet.has(t.id) && t.status !== "DONE" ? { ...t, status: "DONE" } : t
      );
      setCached(TASKS_CACHE_KEY, { ...cached, tasks });
      publishTodayToWidget(tasks);
    } else {
      ExtensionStorage.reloadWidget("RippleTodayWidget");
    }
    return done.length;
  })()
    .catch(() => 0)
    .finally(() => {
      flushInFlight = null;
    });
  return flushInFlight;
}
