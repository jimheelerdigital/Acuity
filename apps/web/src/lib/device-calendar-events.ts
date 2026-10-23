/**
 * Phone calendar events (Apple Calendar / Android calendar), 2026-10-23.
 * Validation for POST /api/integrations/calendar/events. Only titles and
 * times are accepted; anything else in the payload is ignored.
 */

export const DEVICE_EVENT_PREFIX = "device:";
export const MAX_DEVICE_EVENTS = 500;
export const MAX_DEVICE_WINDOW_MS = 10 * 24 * 60 * 60 * 1000;
export const PHONE_PROVIDERS = new Set(["ios_eventkit", "android_calendar"]);

export type DeviceEventIn = { id: string; title: string; start: Date; end: Date; allDay: boolean };

export function parseDeviceEvents(raw: unknown): DeviceEventIn[] | null {
  if (!Array.isArray(raw) || raw.length > MAX_DEVICE_EVENTS) return null;
  const out: DeviceEventIn[] = [];
  for (const e of raw) {
    if (!e || typeof e !== "object") return null;
    const r = e as Record<string, unknown>;
    if (typeof r.id !== "string" || r.id.length === 0 || r.id.length > 300) return null;
    const start = new Date(String(r.start));
    const end = new Date(String(r.end));
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
    const title = typeof r.title === "string" ? r.title.replace(/\s+/g, " ").trim().slice(0, 300) : "";
    out.push({ id: r.id, title, start, end, allDay: r.allDay === true });
  }
  return out;
}

export function parseWindow(start: unknown, end: unknown): { start: Date; end: Date } | null {
  const s = new Date(String(start));
  const e = new Date(String(end));
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return null;
  if (e <= s || e.getTime() - s.getTime() > MAX_DEVICE_WINDOW_MS) return null;
  return { start: s, end: e };
}
