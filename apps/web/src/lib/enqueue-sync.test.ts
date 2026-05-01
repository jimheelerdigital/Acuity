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
