import { beforeEach, describe, expect, it, vi } from "vitest";

const drainRequest = vi.fn();
vi.mock("@/lib/calendar/server-drain-request", () => ({
  requestServerCalendarDrain: (...a: unknown[]) => drainRequest(...a),
}));

import { googleEventIdForTask } from "./calendar/google-calendar-executor";

import {
  DELETION_MAX_ATTEMPTS,
  applyDeletionResult,
  deletionOpId,
  deletionOps,
  drainSupportsDelete,
  parseDeletionOpId,
  queueCalendarDeletion,
} from "./calendar-deletion";

describe("deletion op ids", () => {
  it("round-trips and ignores plain task ids", () => {
    expect(parseDeletionOpId(deletionOpId("del_1"))).toBe("del_1");
    expect(parseDeletionOpId("task_1")).toBeNull();
    expect(parseDeletionOpId("calendar-deletion:")).toBeNull();
  });

  it("only drains deletes for clients that say they support them", () => {
    expect(drainSupportsDelete(new URLSearchParams("supports=delete"))).toBe(true);
    expect(drainSupportsDelete(new URLSearchParams("supports=foo, delete"))).toBe(true);
    expect(drainSupportsDelete(new URLSearchParams(""))).toBe(false);
    expect(drainSupportsDelete(new URLSearchParams("supports=upsert"))).toBe(false);
  });

  it("builds delete ops carrying the event id", () => {
    const [op] = deletionOps([{ id: "del_1", providerEventId: "evt_9" }], {
      userId: "u1",
      providerId: "ios_eventkit",
      targetCalendarId: "cal_1",
    });
    expect(op).toMatchObject({
      taskId: "calendar-deletion:del_1",
      kind: "delete",
      providerEventId: "evt_9",
      dueDateISO: null,
    });
  });
});

describe("queueCalendarDeletion", () => {
  const upsert = vi.fn();
  const findUnique = vi.fn();
  const db = { user: { findUnique }, calendarDeletion: { upsert } } as never;
  beforeEach(() => vi.clearAllMocks());

  it("queues when the task has an event and a phone calendar is connected", async () => {
    findUnique.mockResolvedValue({ calendarConnectedProvider: "ios_eventkit" });
    expect(await queueCalendarDeletion(db, "u1", "evt_9")).toBe(true);
    expect(upsert.mock.calls[0][0].create).toEqual({ userId: "u1", providerEventId: "evt_9" });
  });

  it.each([
    ["no event", null, "ios_eventkit"],
    ["not connected", "evt_9", null],
    ["a provider whose writes don't run (outlook)", "evt_9", "outlook"],
  ])("does nothing with %s", async (_l, eventId, provider) => {
    findUnique.mockResolvedValue({ calendarConnectedProvider: provider });
    expect(await queueCalendarDeletion(db, "u1", eventId as string | null)).toBe(false);
    expect(upsert).not.toHaveBeenCalled();
  });

  it("Google direct: queues the event and asks the server to drain (no phone)", async () => {
    findUnique.mockResolvedValue({ calendarConnectedProvider: "google" });
    expect(await queueCalendarDeletion(db, "u1", "ripple123abc")).toBe(true);
    expect(upsert.mock.calls[0][0].create).toEqual({ userId: "u1", providerEventId: "ripple123abc" });
    expect(drainRequest).toHaveBeenCalledWith("u1");
  });

  it("Google direct: a still-PENDING task queues its deterministic event id", async () => {
    findUnique.mockResolvedValue({ calendarConnectedProvider: "google" });
    expect(
      await queueCalendarDeletion(db, "u1", null, { id: "task_1", calendarSyncStatus: "PENDING" })
    ).toBe(true);
    expect(upsert.mock.calls[0][0].create.providerEventId).toBe(googleEventIdForTask("task_1"));
    // Never synced and not pending: nothing on Google to remove.
    upsert.mockClear();
    expect(
      await queueCalendarDeletion(db, "u1", null, { id: "task_1", calendarSyncStatus: "NOT_SYNCED" })
    ).toBe(false);
    expect(upsert).not.toHaveBeenCalled();
  });

  it("phone providers never trigger a server drain", async () => {
    findUnique.mockResolvedValue({ calendarConnectedProvider: "ios_eventkit" });
    await queueCalendarDeletion(db, "u1", "evt_9");
    expect(drainRequest).not.toHaveBeenCalled();
  });

  it("never throws (the dismiss must still succeed)", async () => {
    findUnique.mockRejectedValue(new Error("db down"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(queueCalendarDeletion(db, "u1", "evt_9")).resolves.toBe(false);
    warn.mockRestore();
  });
});

describe("applyDeletionResult", () => {
  const findFirst = vi.fn();
  const deleteMany = vi.fn();
  const update = vi.fn();
  const db = { calendarDeletion: { findFirst, deleteMany, update } } as never;
  beforeEach(() => vi.clearAllMocks());

  it("removes the row on success, scoped to the user", async () => {
    findFirst.mockResolvedValue({ id: "del_1", attempts: 0 });
    expect(await applyDeletionResult(db, "u1", "del_1", { ok: true })).toBe(true);
    expect(findFirst.mock.calls[0][0].where).toEqual({ id: "del_1", userId: "u1" });
    expect(deleteMany).toHaveBeenCalledWith({ where: { id: "del_1" } });
  });

  it("removes the row on a permanent failure", async () => {
    findFirst.mockResolvedValue({ id: "del_1", attempts: 0 });
    await applyDeletionResult(db, "u1", "del_1", { ok: false, retryable: false, reason: "read only" });
    expect(deleteMany).toHaveBeenCalled();
  });

  it("counts retryable failures and gives up at the cap", async () => {
    findFirst.mockResolvedValue({ id: "del_1", attempts: 0 });
    await applyDeletionResult(db, "u1", "del_1", { ok: false, retryable: true, reason: "busy" });
    expect(update.mock.calls[0][0].data.attempts).toEqual({ increment: 1 });
    expect(deleteMany).not.toHaveBeenCalled();

    findFirst.mockResolvedValue({ id: "del_1", attempts: DELETION_MAX_ATTEMPTS - 1 });
    await applyDeletionResult(db, "u1", "del_1", { ok: false, retryable: true, reason: "busy" });
    expect(deleteMany).toHaveBeenCalled();
  });

  it("ignores someone else's (or an expired) row", async () => {
    findFirst.mockResolvedValue(null);
    expect(await applyDeletionResult(db, "u1", "del_x", { ok: true })).toBe(false);
    expect(deleteMany).not.toHaveBeenCalled();
  });
});
