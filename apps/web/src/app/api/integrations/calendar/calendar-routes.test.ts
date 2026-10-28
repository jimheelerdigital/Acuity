import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 1.9.6 pre-build verification (2026-10-23): runs the real calendar route
 * handlers against a mocked Prisma, so the contracts the phone relies on
 * are exercised, not just grepped.
 */

const db = {
  userFindUnique: vi.fn(),
  userUpdate: vi.fn(),
  taskUpdateMany: vi.fn(),
  eventDeleteMany: vi.fn(),
  eventUpsert: vi.fn(),
  deletionDeleteMany: vi.fn(),
};
const tx = {
  calendarEvent: {
    deleteMany: (...a: unknown[]) => db.eventDeleteMany(...a),
    upsert: (...a: unknown[]) => db.eventUpsert(...a),
  },
};
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: (...a: unknown[]) => db.userFindUnique(...a),
      update: (...a: unknown[]) => db.userUpdate(...a),
    },
    task: { updateMany: (...a: unknown[]) => db.taskUpdateMany(...a) },
    calendarDeletion: { deleteMany: (...a: unknown[]) => db.deletionDeleteMany(...a) },
    $transaction: async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
  },
}));
vi.mock("@/lib/mobile-auth", () => ({ getAnySessionUserId: async () => "user_1" }));
vi.mock("@/lib/paywall", () => ({ requireEntitlement: async () => ({ ok: true }) }));
vi.mock("@/lib/feature-flags", () => ({ gateFeatureFlag: async () => null }));
vi.mock("@/lib/safe-log", () => ({ safeLog: { info: vi.fn(), warn: vi.fn() } }));

const req = (body: unknown) =>
  new Request("http://localhost/x", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.clearAllMocks();
  db.taskUpdateMany.mockResolvedValue({ count: 3 });
  db.eventUpsert.mockResolvedValue({ id: "row" });
  db.eventDeleteMany.mockResolvedValue({ count: 0 });
});

describe("POST /api/integrations/calendar/connect", () => {
  const saved = {
    calendarConnectedProvider: "ios_eventkit",
    calendarConnectedAt: new Date("2026-10-23T00:00:00Z"),
    targetCalendarId: "cal_1",
    autoSendTasks: true,
    defaultEventDuration: "TIMED",
  };

  it("saves the phone calendar, queues open tasks due today+, returns the settings shape", async () => {
    db.userUpdate.mockResolvedValue(saved);
    const { POST } = await import("./connect/route");
    const res = await POST(req({ provider: "ios_eventkit", targetCalendarId: "cal_1", autoSendTasks: true }) as never);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.calendar).toMatchObject({ provider: "ios_eventkit", targetCalendarId: "cal_1", autoSendTasks: true });
    expect(json.queued).toBe(3);
    const where = db.taskUpdateMany.mock.calls[0][0].where;
    expect(where).toMatchObject({ userId: "user_1", status: { not: "DONE" }, calendarSyncStatus: { in: ["NOT_SYNCED", "FAILED"] } });
    expect(where.dueDate.gte).toBeInstanceOf(Date);
    expect(db.taskUpdateMany.mock.calls[0][0].data).toMatchObject({ calendarSyncStatus: "PENDING" });
  });

  it("accepts Android's phone calendar; auto-add off queues nothing", async () => {
    db.userUpdate.mockResolvedValue({ ...saved, calendarConnectedProvider: "android_calendar", autoSendTasks: false });
    const { POST } = await import("./connect/route");
    const res = await POST(req({ provider: "android_calendar", targetCalendarId: "7", autoSendTasks: false }) as never);
    expect(res.status).toBe(200);
    expect(db.taskUpdateMany).not.toHaveBeenCalled();
  });

  it("rejects an unknown provider", async () => {
    const { POST } = await import("./connect/route");
    const res = await POST(req({ provider: "icloud", targetCalendarId: "x" }) as never);
    expect(res.status).toBe(400);
  });
});

describe("POST /api/integrations/calendar/disconnect", () => {
  it("clears the connection and un-queues PENDING tasks", async () => {
    db.userFindUnique.mockResolvedValue({ calendarConnectedProvider: "ios_eventkit" });
    db.userUpdate.mockResolvedValue({});
    const { POST } = await import("./disconnect/route");
    const res = await POST(req({}) as never);
    expect(res.status).toBe(200);
    expect(db.taskUpdateMany).toHaveBeenCalledWith({
      where: { userId: "user_1", calendarSyncStatus: "PENDING" },
      data: { calendarSyncStatus: "NOT_SYNCED", calendarPendingSince: null },
    });
    // Queued event deletions (dismissed tasks) can't run after disconnect.
    expect(db.deletionDeleteMany).toHaveBeenCalledWith({ where: { userId: "user_1" } });
  });
});

describe("POST /api/integrations/calendar/events", () => {
  const body = {
    windowStart: "2026-10-22T04:00:00.000Z",
    windowEnd: "2026-10-31T04:00:00.000Z",
    events: [
      { id: "E1@2026-10-23T14:00:00.000Z", title: "Standup", start: "2026-10-23T14:00:00.000Z", end: "2026-10-23T14:15:00.000Z", allDay: false },
      { id: "E2@2026-10-24T04:00:00.000Z", title: "Day off", start: "2026-10-24T04:00:00.000Z", end: "2026-10-25T04:00:00.000Z", allDay: true },
    ],
  };

  it("upserts each event under device: ids and removes ones the phone dropped", async () => {
    db.userFindUnique.mockResolvedValue({ calendarConnectedProvider: "ios_eventkit" });
    const { POST } = await import("./events/route");
    const res = await POST(req(body) as never);
    expect(res.status).toBe(200);
    expect(db.eventUpsert).toHaveBeenCalledTimes(2);
    const first = db.eventUpsert.mock.calls[0][0];
    expect(first.where.userId_externalEventId).toEqual({ userId: "user_1", externalEventId: "device:E1@2026-10-23T14:00:00.000Z" });
    expect(first.create).toMatchObject({ summary: "Standup", allDay: false });
    expect(db.eventUpsert.mock.calls[1][0].create.allDay).toBe(true);
    const del = db.eventDeleteMany.mock.calls[0][0].where;
    expect(del.externalEventId.startsWith).toBe("device:");
    expect(del.externalEventId.notIn).toHaveLength(2);
    expect(del.startTime.gte).toEqual(new Date(body.windowStart));
  });

  it("409 when not connected to a phone calendar (e.g. Google)", async () => {
    db.userFindUnique.mockResolvedValue({ calendarConnectedProvider: "google" });
    const { POST } = await import("./events/route");
    const res = await POST(req(body) as never);
    expect(res.status).toBe(409);
    expect(db.eventUpsert).not.toHaveBeenCalled();
  });

  it("400 on a bad body", async () => {
    const { POST } = await import("./events/route");
    expect((await POST(req({ ...body, events: "x" }) as never)).status).toBe(400);
    expect((await POST(req({ ...body, windowEnd: "2026-12-31T00:00:00Z" }) as never)).status).toBe(400);
  });
});
