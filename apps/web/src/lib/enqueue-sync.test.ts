import { describe, expect, it, vi } from "vitest";

import { enqueueSyncForLoadedTask } from "./enqueue-sync";
import type { TaskForPlanning, UserForPlanning } from "./calendar-sync";

const TOMORROW = new Date(Date.now() + 24 * 60 * 60 * 1000);

const baseTask = (
  overrides: Partial<TaskForPlanning> = {}
): TaskForPlanning => ({
  id: "task-1",
  userId: "user-1",
  title: "Buy gift",
  text: null,
  status: "OPEN",
  dueDate: TOMORROW,
  calendarEventId: null,
  calendarSyncStatus: "NOT_SYNCED",
  ...overrides,
});

const connectedUser = (
  overrides: Partial<UserForPlanning> = {}
): UserForPlanning => ({
  calendarConnectedProvider: "ios_eventkit",
  targetCalendarId: "cal-work-1",
  autoSendTasks: true,
  defaultEventDuration: "TIMED",
  ...overrides,
});

function buildTxMock() {
  const update = vi.fn().mockResolvedValue({});
  return {
    tx: { task: { update } } as unknown as Parameters<
      typeof enqueueSyncForLoadedTask
    >[0],
    update,
  };
}

describe("enqueueSyncForLoadedTask — happy paths", () => {
  it("create action enqueues PENDING when conditions met", async () => {
    const { tx, update } = buildTxMock();
    const r = await enqueueSyncForLoadedTask(
      tx,
      baseTask(),
      connectedUser(),
      "create"
    );
    expect(r.enqueued).toBe(true);
    expect(update).toHaveBeenCalledTimes(1);
    expect(update.mock.calls[0][0].data).toEqual({
      calendarSyncStatus: "PENDING",
    });
  });

  it("edit action enqueues PENDING for follow-up sync", async () => {
    const { tx, update } = buildTxMock();
    const r = await enqueueSyncForLoadedTask(
      tx,
      baseTask({ calendarEventId: "evt-existing" }),
      connectedUser(),
      "edit"
    );
    expect(r.enqueued).toBe(true);
    expect(update).toHaveBeenCalledTimes(1);
  });

  it("complete action enqueues PENDING when task was previously synced", async () => {
    const { tx, update } = buildTxMock();
    const r = await enqueueSyncForLoadedTask(
      tx,
      baseTask({ status: "DONE", calendarEventId: "evt-existing" }),
      connectedUser(),
      "complete"
    );
    expect(r.enqueued).toBe(true);
    expect(update).toHaveBeenCalledTimes(1);
  });

  it("manual action bypasses autoSendTasks=false gate", async () => {
    const { tx, update } = buildTxMock();
    const r = await enqueueSyncForLoadedTask(
      tx,
      baseTask(),
      connectedUser({ autoSendTasks: false }),
      "manual"
    );
    expect(r.enqueued).toBe(true);
    expect(update).toHaveBeenCalledTimes(1);
  });

  it("reopen action enqueues PENDING (re-emit upsert to un-strike-through)", async () => {
    const { tx, update } = buildTxMock();
    const r = await enqueueSyncForLoadedTask(
      tx,
      baseTask({ status: "OPEN", calendarEventId: "evt-existing" }),
      connectedUser(),
      "reopen"
    );
    expect(r.enqueued).toBe(true);
    expect(update).toHaveBeenCalledTimes(1);
  });
});

describe("enqueueSyncForLoadedTask — no-op paths", () => {
  it("returns no-op when calendar not connected", async () => {
    const { tx, update } = buildTxMock();
    const r = await enqueueSyncForLoadedTask(
      tx,
      baseTask(),
      connectedUser({ calendarConnectedProvider: null }),
      "create"
    );
    expect(r.enqueued).toBe(false);
    expect(r.reason).toBe("no-op-needed");
    expect(update).not.toHaveBeenCalled();
  });

  it("returns no-op when autoSendTasks=false on fresh create", async () => {
    const { tx, update } = buildTxMock();
    const r = await enqueueSyncForLoadedTask(
      tx,
      baseTask(),
      connectedUser({ autoSendTasks: false }),
      "create"
    );
    expect(r.enqueued).toBe(false);
    expect(update).not.toHaveBeenCalled();
  });

  it("returns no-op when no dueDate on a fresh create", async () => {
    const { tx, update } = buildTxMock();
    const r = await enqueueSyncForLoadedTask(
      tx,
      baseTask({ dueDate: null }),
      connectedUser(),
      "create"
    );
    expect(r.enqueued).toBe(false);
    expect(update).not.toHaveBeenCalled();
  });

  it("returns no-op for complete when never synced", async () => {
    const { tx, update } = buildTxMock();
    const r = await enqueueSyncForLoadedTask(
      tx,
      baseTask({ status: "DONE", calendarEventId: null }),
      connectedUser(),
      "complete"
    );
    expect(r.enqueued).toBe(false);
    expect(update).not.toHaveBeenCalled();
  });
});

describe("enqueueSyncForTask — P2022 short-circuit (slice C5b)", () => {
  // The runtime helper does its own Prisma fetches; tests that aren't
  // already exercising that path use enqueueSyncForLoadedTask. Here
  // we mount a mock tx that throws P2022 and verify the helper
  // catches it cleanly instead of bubbling to the route.
  function buildPrismaWithP2022() {
    const err = Object.assign(
      new Error("column \"calendarConnectedProvider\" does not exist"),
      { code: "P2022" }
    );
    const findFirst = vi.fn().mockRejectedValue(err);
    const findUnique = vi.fn().mockRejectedValue(err);
    const update = vi.fn().mockRejectedValue(err);
    return {
      tx: {
        task: { findFirst, update },
        user: { findUnique },
      } as unknown as Parameters<
        typeof import("./enqueue-sync").enqueueSyncForTask
      >[0],
      findFirst,
      findUnique,
      update,
    };
  }

  it("returns schema-not-ready when Prisma throws P2022 on the task fetch", async () => {
    const { enqueueSyncForTask } = await import("./enqueue-sync");
    const { tx } = buildPrismaWithP2022();
    const r = await enqueueSyncForTask(tx, "task-1", "user-1", "create");
    expect(r.enqueued).toBe(false);
    expect(r.reason).toBe("schema-not-ready");
  });

  it("re-throws non-P2022 errors so real bugs surface in Sentry", async () => {
    const { enqueueSyncForTask } = await import("./enqueue-sync");
    const otherErr = new Error("connection pool exhausted");
    const tx = {
      task: { findFirst: vi.fn().mockRejectedValue(otherErr) },
      user: { findUnique: vi.fn() },
    } as unknown as Parameters<
      typeof import("./enqueue-sync").enqueueSyncForTask
    >[0];
    await expect(
      enqueueSyncForTask(tx, "task-1", "user-1", "create")
    ).rejects.toThrow("connection pool exhausted");
  });

  it("treats Postgres native 42703 as the same condition", async () => {
    const { enqueueSyncForTask } = await import("./enqueue-sync");
    const err = Object.assign(new Error("undefined column"), {
      meta: { code: "42703" },
    });
    const tx = {
      task: { findFirst: vi.fn().mockRejectedValue(err) },
      user: { findUnique: vi.fn() },
    } as unknown as Parameters<
      typeof import("./enqueue-sync").enqueueSyncForTask
    >[0];
    const r = await enqueueSyncForTask(tx, "task-1", "user-1", "create");
    expect(r.reason).toBe("schema-not-ready");
  });

  it("string-matches \"column ... does not exist\" when error code is missing", async () => {
    const { enqueueSyncForTask } = await import("./enqueue-sync");
    const err = new Error(
      'PrismaClientKnownRequestError: column "autoSendTasks" does not exist on table "User"'
    );
    const tx = {
      task: { findFirst: vi.fn().mockRejectedValue(err) },
      user: { findUnique: vi.fn() },
    } as unknown as Parameters<
      typeof import("./enqueue-sync").enqueueSyncForTask
    >[0];
    const r = await enqueueSyncForTask(tx, "task-1", "user-1", "create");
    expect(r.reason).toBe("schema-not-ready");
  });
});

describe("enqueueSyncForLoadedTask — idempotency", () => {
  it("re-enqueueing the same action writes the same PENDING value", async () => {
    const { tx, update } = buildTxMock();
    const t = baseTask();
    const u = connectedUser();
    await enqueueSyncForLoadedTask(tx, t, u, "create");
    await enqueueSyncForLoadedTask(tx, t, u, "create");
    expect(update).toHaveBeenCalledTimes(2);
    expect(update.mock.calls[0][0].data).toEqual(
      update.mock.calls[1][0].data
    );
  });
});
