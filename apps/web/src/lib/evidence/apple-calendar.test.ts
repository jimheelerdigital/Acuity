/**
 * Calendar, "option a" (Jimmy, 2026-10-23): the phone's own calendar
 * (Apple Calendar / Android calendar, which include Google accounts added
 * to the phone). Tasks are written on the phone; event titles + times come
 * back for entry context.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { localDayFromISO, plannedEventFor, type DrainOp } from "../../../../mobile/lib/calendar-op";
import { formatTime } from "../calendar/context";
import { selectStuckTaskIds } from "../calendar-sync";
import { DEVICE_EVENT_PREFIX, parseDeviceEvents, parseWindow } from "../device-calendar-events";

const mobile = (p: string) => readFileSync(resolve(__dirname, "../../../../mobile", p), "utf8");
const web = (p: string) => readFileSync(resolve(__dirname, "../..", p), "utf8");

const op = (o: Partial<DrainOp> = {}): DrainOp => ({
  taskId: "t1",
  kind: "upsert",
  providerEventId: null,
  targetCalendarId: "cal1",
  taskTitle: "Call dentist",
  dueDateISO: "2026-10-25T00:00:00.000Z",
  duration: "TIMED",
  ...o,
});

describe("task → phone calendar event", () => {
  it("reads the due day from the ISO string, never shifted by timezone", () => {
    expect(localDayFromISO("2026-10-25T00:00:00.000Z")).toEqual({ y: 2026, m: 9, d: 25 });
  });

  it("timed: 9-10am local on the due day, titled Ripple:", () => {
    const e = plannedEventFor(op())!;
    expect(e.title).toBe("Ripple: Call dentist");
    expect(e.allDay).toBe(false);
    expect([e.start.getFullYear(), e.start.getMonth(), e.start.getDate(), e.start.getHours()]).toEqual([2026, 9, 25, 9]);
    expect(e.end.getHours()).toBe(10);
  });

  it("all-day spans the due day; done tasks get a check", () => {
    const e = plannedEventFor(op({ duration: "ALL_DAY", kind: "complete" }))!;
    expect(e.allDay).toBe(true);
    expect(e.title).toBe("✓ Ripple: Call dentist");
    expect(e.end.getDate()).toBe(26);
  });

  it("no due date → nothing to write", () => {
    expect(plannedEventFor(op({ dueDateISO: null }))).toBeNull();
  });
});

describe("phone events → Ripple", () => {
  it("accepts titles and times only, and rejects junk", () => {
    const ok = parseDeviceEvents([
      { id: "a@1", title: "  Standup  ", start: "2026-10-23T14:00:00Z", end: "2026-10-23T14:15:00Z", allDay: false, notes: "secret", attendees: ["x"] },
    ]);
    expect(ok).toEqual([{ id: "a@1", title: "Standup", start: new Date("2026-10-23T14:00:00Z"), end: new Date("2026-10-23T14:15:00Z"), allDay: false }]);
    expect(parseDeviceEvents([{ id: "", start: "x", end: "y" }])).toBeNull();
    expect(parseDeviceEvents("nope")).toBeNull();
    expect(parseDeviceEvents(new Array(501).fill({ id: "a", start: "2026-10-23", end: "2026-10-23" }))).toBeNull();
  });

  it("windows are bounded", () => {
    expect(parseWindow("2026-10-22", "2026-10-31")).not.toBeNull();
    expect(parseWindow("2026-10-22", "2026-12-31")).toBeNull();
    expect(parseWindow("2026-10-31", "2026-10-22")).toBeNull();
  });

  it("route upserts (keeping ids for entry links) and removes events the phone dropped", () => {
    const route = web("app/api/integrations/calendar/events/route.ts");
    expect(route).toMatch(/calendarEvent\.deleteMany\(\{[\s\S]*?startsWith: DEVICE_EVENT_PREFIX, notIn: ids/);
    expect(route).toMatch(/calendarEvent\.upsert\(/);
    expect(DEVICE_EVENT_PREFIX).toBe("device:");
  });

  it("prompt times use the user's timezone", () => {
    const d = new Date("2026-10-23T14:00:00Z");
    expect(formatTime(d, "America/New_York")).toBe("10:00 AM");
    expect(formatTime(d, "America/Los_Angeles")).toBe("7:00 AM");
    expect(formatTime(d, "Not/AZone")).toBe("9:00 AM");
  });
});

describe("server fixes", () => {
  it("stuck-task timer starts when the task was queued, not when it was created", () => {
    const now = new Date("2026-10-23T12:00:00Z");
    const oldTaskQueuedNow = {
      id: "a",
      calendarPendingSince: new Date(now.getTime() - 60_000),
      calendarSyncedAt: null,
      createdAt: new Date("2026-01-01T00:00:00Z"),
    };
    expect(selectStuckTaskIds([oldTaskQueuedNow], now)).toEqual([]);
  });

  it("connect queues open tasks due today or later; disconnect un-queues", () => {
    const connect = web("app/api/integrations/calendar/connect/route.ts");
    expect(connect).toMatch(/if \(user\.autoSendTasks\) \{[\s\S]*?status: \{ not: "DONE" \}[\s\S]*?calendarSyncStatus: "PENDING"/);
    expect(connect).toMatch(/"android_calendar"/);
    const disconnect = web("app/api/integrations/calendar/disconnect/route.ts");
    expect(disconnect).toMatch(/calendarSyncStatus: "PENDING" \},\s*data: \{ calendarSyncStatus: "NOT_SYNCED"/);
  });
});

describe("phone wiring", () => {
  it("connects from Profile → Calendar with a real flow", () => {
    const screen = mobile("app/integrations.tsx");
    expect(screen).toMatch(/requestCalendarPermission\(\)/);
    expect(screen).toMatch(/provider: DEVICE_PROVIDER, targetCalendarId: selected, autoSendTasks: autoSend/);
    expect(screen).not.toMatch(/Coming in next update/);
  });

  it("syncs on sign-in and every foreground", () => {
    const layout = mobile("app/_layout.tsx");
    expect((layout.match(/void runCalendarSync\(\);/g) ?? []).length).toBe(2);
  });

  it("is safe on builds without the native module", () => {
    expect(mobile("lib/device-calendar.ts")).toMatch(/requireOptionalNativeModule\(NATIVE\)/);
    expect(mobile("lib/calendar-sync-client.ts")).toMatch(/if \(running \|\| !deviceCalendarAvailable\(\)\) return;/);
  });

  it("declares the calendar permission string", () => {
    expect(mobile("app.json")).toMatch(/"expo-calendar",\s*\{\s*"calendarPermission": "Ripple reads the titles and times/);
  });
});
