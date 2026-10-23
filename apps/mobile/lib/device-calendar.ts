import { requireOptionalNativeModule } from "expo";
import type * as CalendarTypes from "expo-calendar";
import { Platform } from "react-native";

/**
 * The phone's own calendar (Apple Calendar on iPhone, the system calendar on
 * Android). Jimmy, 2026-10-23: "option a". Any account the person has added
 * to the phone shows up here, Google included, so this covers Google
 * Calendar without a Google sign-in.
 *
 * Builds without the native module (1.9.5 and older) must not crash when
 * this JS arrives over the air, so availability is checked with
 * requireOptionalNativeModule and expo-calendar is loaded with import() on
 * first use (same pattern as lib/handwriting-capture.ts).
 */

const NATIVE = "ExpoCalendar";
let availability: boolean | null = null;

export function deviceCalendarAvailable(): boolean {
  if (availability === null) {
    try {
      availability = requireOptionalNativeModule(NATIVE) != null;
    } catch {
      availability = false;
    }
  }
  return availability;
}

/** Server provider id for this phone's calendar. */
export const DEVICE_PROVIDER: "ios_eventkit" | "android_calendar" =
  Platform.OS === "ios" ? "ios_eventkit" : "android_calendar";

async function cal(): Promise<typeof CalendarTypes> {
  return import("expo-calendar");
}

export type CalendarPermission = "granted" | "denied" | "undetermined" | "unavailable";

export async function calendarPermission(): Promise<CalendarPermission> {
  if (!deviceCalendarAvailable()) return "unavailable";
  const { getCalendarPermissionsAsync } = await cal();
  const res = await getCalendarPermissionsAsync();
  return res.status === "granted" ? "granted" : res.canAskAgain ? "undetermined" : "denied";
}

/** Shows the system prompt (only when the person taps Connect). */
export async function requestCalendarPermission(): Promise<CalendarPermission> {
  if (!deviceCalendarAvailable()) return "unavailable";
  const { requestCalendarPermissionsAsync } = await cal();
  const res = await requestCalendarPermissionsAsync();
  return res.status === "granted" ? "granted" : res.canAskAgain ? "undetermined" : "denied";
}

export type DeviceCalendar = {
  id: string;
  title: string;
  /** Account it belongs to ("iCloud", "you@gmail.com"). */
  source: string;
  color: string | null;
  isDefault: boolean;
};

/** Calendars Ripple can add events to. Default first, then by account. */
export async function writableCalendars(): Promise<DeviceCalendar[]> {
  const C = await cal();
  const all = await C.getCalendarsAsync(C.EntityTypes.EVENT);
  let defaultId: string | null = null;
  if (Platform.OS === "ios") {
    try {
      defaultId = (await C.getDefaultCalendarAsync()).id;
    } catch {
      defaultId = null;
    }
  }
  return all
    .filter((c) => c.allowsModifications)
    .map((c) => ({
      id: c.id,
      title: c.title,
      source: c.source?.name ?? "",
      color: c.color ?? null,
      isDefault: c.id === defaultId || (defaultId === null && c.isPrimary === true),
    }))
    .sort((a, b) =>
      a.isDefault !== b.isDefault ? (a.isDefault ? -1 : 1) : a.source.localeCompare(b.source) || a.title.localeCompare(b.title)
    );
}

export type DeviceEvent = { id: string; title: string; start: string; end: string; allDay: boolean };

/**
 * Event titles + times across every calendar on the phone, for a window.
 * Nothing else leaves the phone (no notes, attendees or locations).
 */
export async function readEvents(start: Date, end: Date): Promise<DeviceEvent[]> {
  const C = await cal();
  const calendars = await C.getCalendarsAsync(C.EntityTypes.EVENT);
  if (calendars.length === 0) return [];
  const events = await C.getEventsAsync(
    calendars.map((c) => c.id),
    start,
    end
  );
  return events
    .filter((e) => e.status !== C.EventStatus.CANCELED)
    .map((e) => ({
      // Recurring occurrences share an id; the start makes each unique.
      id: `${e.id}@${new Date(e.startDate).toISOString()}`,
      title: (e.title ?? "").trim(),
      start: new Date(e.startDate).toISOString(),
      end: new Date(e.endDate).toISOString(),
      allDay: e.allDay === true,
    }));
}

export type EventInput = { title: string; start: Date; end: Date; allDay: boolean; notes?: string };

export async function createEvent(calendarId: string, input: EventInput): Promise<string> {
  const C = await cal();
  return C.createEventAsync(calendarId, {
    title: input.title,
    startDate: input.start,
    endDate: input.end,
    allDay: input.allDay,
    notes: input.notes,
  });
}

/** Updates an event; throws if it no longer exists (caller recreates). */
export async function updateEvent(eventId: string, input: Partial<EventInput>): Promise<void> {
  const C = await cal();
  await C.updateEventAsync(eventId, {
    ...(input.title !== undefined ? { title: input.title } : {}),
    ...(input.start ? { startDate: input.start } : {}),
    ...(input.end ? { endDate: input.end } : {}),
    ...(input.allDay !== undefined ? { allDay: input.allDay } : {}),
  });
}

export async function eventExists(eventId: string): Promise<boolean> {
  const C = await cal();
  try {
    const e = await C.getEventAsync(eventId);
    return e != null;
  } catch {
    return false;
  }
}
