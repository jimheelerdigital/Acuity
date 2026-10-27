import { describe, expect, it, vi } from "vitest";

import { enqueueEntryTasksForCalendar } from "./enqueue-sync";

type Db = Parameters<typeof enqueueEntryTasksForCalendar>[0];

function buildDb(user: Record<string, unknown> | null, count = 2) {
  const findUnique = vi.fn().mockResolvedValue(user);
  const updateMany = vi.fn().mockResolvedValue({ count });
  const db = {
    user: { findUnique },
    task: { updateMany },
  } as unknown as Db;
  return { db, findUnique, updateMany };
}

const connected = {
  calendarConnectedProvider: "ios_eventkit",
  targetCalendarId: "cal-1",
  autoSendTasks: true,
};

describe("enqueueEntryTasksForCalendar", () => {
  it("queues the entry's open, dated, unsynced tasks for a connected user", async () => {
    const { db, updateMany } = buildDb(connected, 3);
    const n = await enqueueEntryTasksForCalendar(db, "u1", "e1");
    expect(n).toBe(3);
    const arg = updateMany.mock.calls[0][0];
    expect(arg.where).toMatchObject({
      userId: "u1",
      entryId: "e1",
      status: { not: "DONE" },
      calendarSyncStatus: "NOT_SYNCED",
    });
    expect(arg.where.dueDate.gte).toBeInstanceOf(Date);
    expect(arg.data).toEqual({
      calendarSyncStatus: "PENDING",
      calendarPendingSince: expect.any(Date),
    });
  });

  it("works for Android phone calendars too", async () => {
    const { db, updateMany } = buildDb({
      ...connected,
      calendarConnectedProvider: "android_calendar",
    });
    await enqueueEntryTasksForCalendar(db, "u1", "e1");
    expect(updateMany).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["no user", null],
    ["not connected", { ...connected, calendarConnectedProvider: null }],
    ["unknown provider", { ...connected, calendarConnectedProvider: "fitbit" }],
    ["no target calendar", { ...connected, targetCalendarId: null }],
    ["auto-add off", { ...connected, autoSendTasks: false }],
  ])("does nothing when %s", async (_label, user) => {
    const { db, updateMany } = buildDb(user as Record<string, unknown> | null);
    expect(await enqueueEntryTasksForCalendar(db, "u1", "e1")).toBe(0);
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("never throws (the extraction must still succeed)", async () => {
    const findUnique = vi.fn().mockRejectedValue(new Error("db down"));
    const db = { user: { findUnique }, task: { updateMany: vi.fn() } } as unknown as Db;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(enqueueEntryTasksForCalendar(db, "u1", "e1")).resolves.toBe(0);
    warn.mockRestore();
  });
});
