import AsyncStorage from "@react-native-async-storage/async-storage";

import { api } from "@/lib/api";
import { eventForOp, eventTitle, type DrainOp } from "@/lib/calendar-op";
import { loadPlannedBlocks } from "@/lib/day-plan-store";
import {
  calendarPermission,
  createEvent,
  DEVICE_PROVIDER,
  deviceCalendarAvailable,
  eventExists,
  readEvents,
  updateEvent,
} from "@/lib/device-calendar";

/**
 * The phone side of calendar sync (the missing "slice C6"). Runs on app
 * foreground for a connected Pro user:
 *
 *   1. Tasks → calendar: GET /drain returns every task waiting to be
 *      written (PENDING). Each one is created/updated on the phone's
 *      calendar, and the result goes to /sync-result (PENDING → SYNCED /
 *      FAILED on the server).
 *   2. Calendar → entries: the titles + times of events from yesterday to
 *      a week ahead go to /events, so the extraction prompt and the entry's
 *      linked events use the person's real day. Throttled to every 30 min.
 *
 * Never throws: calendar trouble must not break app start.
 */

type Settings = { connected: boolean; calendar: { provider: string; targetCalendarId: string | null } | null };

const EVENTS_UPLOADED_AT_KEY = "ripple.calendar.eventsUploadedAt";
const EVENTS_EVERY_MS = 30 * 60 * 1000;
let running = false;

export async function runCalendarSync(opts: { forceEvents?: boolean } = {}): Promise<void> {
  if (running || !deviceCalendarAvailable()) return;
  running = true;
  try {
    if ((await calendarPermission()) !== "granted") return;
    let settings: Settings;
    try {
      settings = await api.get<Settings>("/api/integrations/calendar/settings");
    } catch {
      return; // not Pro (402), offline, or signed out
    }
    if (!settings.connected || settings.calendar?.provider !== DEVICE_PROVIDER) return;
    await drainTasks();
    await uploadEvents(opts.forceEvents === true);
  } catch {
    // best-effort
  } finally {
    running = false;
  }
}

async function report(body: Record<string, unknown>): Promise<void> {
  try {
    await api.post("/api/integrations/calendar/sync-result", body);
  } catch {
    // Task stays PENDING; the next foreground retries it.
  }
}

async function drainTasks(): Promise<void> {
  const { ops } = await api.get<{ ops: DrainOp[] }>("/api/integrations/calendar/drain");
  if (ops.length === 0) return;
  const blocks = await loadPlannedBlocks();
  for (const op of ops) {
    // Checking a task off only marks its event ✓ — it never moves it
    // (a planned 2 PM block stays at 2 PM).
    if (op.kind === "complete" && op.providerEventId) {
      try {
        if (await eventExists(op.providerEventId)) {
          await updateEvent(op.providerEventId, { title: eventTitle(op.taskTitle, true) });
          await report({ taskId: op.taskId, ok: true, providerEventId: op.providerEventId });
          continue;
        }
      } catch {
        // fall through to the full write below
      }
    }
    const planned = eventForOp(op, blocks[op.taskId] ?? null);
    if (!planned) {
      await report({ taskId: op.taskId, ok: false, retryable: false, reason: "no_due_date" });
      continue;
    }
    try {
      let eventId = op.providerEventId;
      if (eventId && (await eventExists(eventId))) {
        await updateEvent(eventId, planned);
      } else {
        eventId = await createEvent(op.targetCalendarId, {
          ...planned,
          notes: "Added by Ripple",
        });
      }
      await report({ taskId: op.taskId, ok: true, providerEventId: eventId });
    } catch (err) {
      const reason = err instanceof Error ? err.message.slice(0, 300) : "unknown";
      // A calendar that's gone or read-only won't fix itself; anything
      // else (a busy calendar store) is worth another try.
      const permanent = /calendar.*(not found|invalid|read.?only)|not allowed|permission/i.test(reason);
      await report({ taskId: op.taskId, ok: false, retryable: !permanent, reason });
    }
  }
}

async function uploadEvents(force: boolean): Promise<void> {
  if (!force) {
    const last = Number((await AsyncStorage.getItem(EVENTS_UPLOADED_AT_KEY)) ?? 0);
    if (Date.now() - last < EVENTS_EVERY_MS) return;
  }
  const now = new Date();
  const windowStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  const windowEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 8);
  const events = await readEvents(windowStart, windowEnd);
  await api.post("/api/integrations/calendar/events", {
    windowStart: windowStart.toISOString(),
    windowEnd: windowEnd.toISOString(),
    events: events.slice(0, 500),
  });
  await AsyncStorage.setItem(EVENTS_UPLOADED_AT_KEY, String(Date.now()));
}

/** Sign-out / disconnect: forget the throttle so the next connect uploads at once. */
export async function resetCalendarSyncState(): Promise<void> {
  await AsyncStorage.removeItem(EVENTS_UPLOADED_AT_KEY).catch(() => {});
}
