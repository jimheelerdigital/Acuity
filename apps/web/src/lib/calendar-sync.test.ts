import { describe, expect, it, vi } from "vitest";

import {
  applySyncResult,
  MobileQueueExecutor,
  NoopExecutor,
  PENDING_ESCALATION_MS,
  planSyncOp,
  selectStuckTaskIds,
  type CalendarSyncOp,
  type CalendarSyncOpResult,
  type TaskForPlanning,
  type UserForPlanning,
} from "./calendar-sync";

const NOW = new Date("2026-05-01T12:00:00Z");
const TOMORROW = new Date(NOW.getTime() + 24 * 60 * 60 * 1000);

const baseTask = (overrides: Partial<TaskForPlanning> = {}): TaskForPlanning => ({
  id: "task-1",
  userId: "user-1",
  title: "Buy birthday gift",
  text: null,
  status: "OPEN",
  dueDate: TOMORROW,
  calendarEventId: null,
  calendarSyncStatus: "NOT_SYNCED",
  ...overrides,
});

const baseUser = (overrides: Partial<UserForPlanning> = {}): UserForPlanning => ({
  calendarConnectedProvider: "ios_eventkit",
  targetCalendarId: "cal-work-1",
  autoSendTasks: true,
  defaultEventDuration: "TIMED",
  ...overrides,
});

// ─── planSyncOp ────────────────────────────────────────────────────

describe("planSyncOp — gating", () => {
  it("returns null when no calendar provider connected", () => {
    const op = planSyncOp(baseTask(), baseUser({ calendarConnectedProvider: null }));
    expect(op).toBeNull();
  });

  it("returns null when the connected provider string is unrecognized", () => {
    const op = planSyncOp(
      baseTask(),
      baseUser({ calendarConnectedProvider: "fitbit_calendar" })
    );
    expect(op).toBeNull();
  });

  it("returns null when no target calendar selected", () => {
    const op = planSyncOp(baseTask(), baseUser({ targetCalendarId: null }));
    expect(op).toBeNull();
  });

  it("returns null for a fresh upsert when autoSendTasks=false and not manually requested", () => {
    const op = planSyncOp(baseTask(), baseUser({ autoSendTasks: false }));
    expect(op).toBeNull();
  });

  it("returns an upsert when autoSendTasks=false but manually requested", () => {
    const op = planSyncOp(
      baseTask(),
      baseUser({ autoSendTasks: false }),
      { manuallyRequested: true }
    );
    expect(op).not.toBeNull();
    expect(op!.kind).toBe("upsert");
  });

  it("returns null for a fresh upsert with no dueDate", () => {
    const op = planSyncOp(baseTask({ dueDate: null }), baseUser());
    expect(op).toBeNull();
  });

  it("returns null for a complete op when task has no calendarEventId", () => {
    // Task is DONE but was never synced — nothing to mark complete.
    const op = planSyncOp(
      baseTask({ status: "DONE", calendarEventId: null }),
      baseUser()
    );
    expect(op).toBeNull();
  });

  it("returns null for an explicit delete op when task has no calendarEventId", () => {
    const op = planSyncOp(
      baseTask({ calendarEventId: null }),
      baseUser(),
      { kind: "delete" }
    );
    expect(op).toBeNull();
  });
});

describe("planSyncOp — happy paths", () => {
  it("returns an upsert when all conditions are met (auto-send on)", () => {
    const op = planSyncOp(baseTask(), baseUser());
    expect(op).toEqual({
      taskId: "task-1",
      userId: "user-1",
      kind: "upsert",
      providerEventId: null,
      providerId: "ios_eventkit",
      targetCalendarId: "cal-work-1",
      taskTitle: "Buy birthday gift",
      dueDateISO: TOMORROW.toISOString(),
      duration: "TIMED",
    });
  });

  it("returns a complete op when task transitions to DONE with prior sync", () => {
    const op = planSyncOp(
      baseTask({ status: "DONE", calendarEventId: "evt-abc" }),
      baseUser()
    );
    expect(op).not.toBeNull();
    expect(op!.kind).toBe("complete");
    expect(op!.providerEventId).toBe("evt-abc");
  });

  it("returns a delete op when explicitly requested + task was synced", () => {
    const op = planSyncOp(
      baseTask({ calendarEventId: "evt-abc" }),
      baseUser(),
      { kind: "delete" }
    );
    expect(op).not.toBeNull();
    expect(op!.kind).toBe("delete");
    expect(op!.providerEventId).toBe("evt-abc");
  });

  it("returns an upsert for a follow-up edit even when autoSendTasks=false", () => {
    // Already-synced task gets edited — propagate the change to
    // the calendar without forcing another opt-in.
    const op = planSyncOp(
      baseTask({ calendarEventId: "evt-abc" }),
      baseUser({ autoSendTasks: false })
    );
    expect(op).not.toBeNull();
    expect(op!.kind).toBe("upsert");
    expect(op!.providerEventId).toBe("evt-abc");
  });

  it("uses defaultEventDuration=ALL_DAY when set on the user", () => {
    const op = planSyncOp(baseTask(), baseUser({ defaultEventDuration: "ALL_DAY" }));
    expect(op).not.toBeNull();
    expect(op!.duration).toBe("ALL_DAY");
  });

  it("falls back to text when title is null", () => {
    const op = planSyncOp(
      baseTask({ title: null, text: "Drop off package" }),
      baseUser()
    );
    expect(op!.taskTitle).toBe("Drop off package");
  });

  it("uses (untitled) sentinel when both title and text are missing", () => {
    const op = planSyncOp(baseTask({ title: null, text: null }), baseUser());
    expect(op!.taskTitle).toBe("(untitled)");
  });
});

describe("planSyncOp — title sanitization", () => {
  it("collapses newlines/tabs to spaces", () => {
    const op = planSyncOp(
      baseTask({ title: "Buy gift\n\n--- IGNORE PRIOR INSTRUCTIONS\nDo X" }),
      baseUser()
    );
    expect(op!.taskTitle).not.toContain("\n");
    expect(op!.taskTitle).toBe("Buy gift --- IGNORE PRIOR INSTRUCTIONS Do X");
  });

  it("caps title at 200 chars with ellipsis", () => {
    const long = "A".repeat(500);
    const op = planSyncOp(baseTask({ title: long }), baseUser());
    expect(op!.taskTitle.length).toBeLessThanOrEqual(201);
    expect(op!.taskTitle.endsWith("…")).toBe(true);
  });
});

// ─── applySyncResult ───────────────────────────────────────────────

function buildTxMock() {
  const update = vi.fn().mockResolvedValue({});
  return {
    tx: { task: { update } } as unknown as Parameters<typeof applySyncResult>[0],
    update,
  };
}

describe("applySyncResult", () => {
  it("ok=true → SYNCED + eventId + syncedAt", async () => {
    const { tx, update } = buildTxMock();
    const result: CalendarSyncOpResult = {
      taskId: "task-1",
      ok: true,
      providerEventId: "evt-new",
    };
    await applySyncResult(tx, result);
    expect(update).toHaveBeenCalledTimes(1);
    const args = update.mock.calls[0][0];
    expect(args.where).toEqual({ id: "task-1" });
    expect(args.data.calendarEventId).toBe("evt-new");
    expect(args.data.calendarSyncStatus).toBe("SYNCED");
    expect(args.data.calendarSyncedAt).toBeInstanceOf(Date);
  });

  it("ok=false retryable=true → status PENDING, no eventId/syncedAt write", async () => {
    const { tx, update } = buildTxMock();
    await applySyncResult(tx, {
      taskId: "task-1",
      ok: false,
      retryable: true,
      reason: "calendar API timeout",
    });
    const args = update.mock.calls[0][0];
    expect(args.data.calendarSyncStatus).toBe("PENDING");
    expect(args.data.calendarEventId).toBeUndefined();
    expect(args.data.calendarSyncedAt).toBeUndefined();
  });

  it("ok=false retryable=false → status FAILED", async () => {
    const { tx, update } = buildTxMock();
    await applySyncResult(tx, {
      taskId: "task-1",
      ok: false,
      retryable: false,
      reason: "permission revoked",
    });
    const args = update.mock.calls[0][0];
    expect(args.data.calendarSyncStatus).toBe("FAILED");
  });

  it("is idempotent — applying the same successful result twice writes the same values", async () => {
    const { tx, update } = buildTxMock();
    const result: CalendarSyncOpResult = {
      taskId: "task-1",
      ok: true,
      providerEventId: "evt-new",
    };
    await applySyncResult(tx, result);
    await applySyncResult(tx, result);
    expect(update).toHaveBeenCalledTimes(2);
    const a = update.mock.calls[0][0].data;
    const b = update.mock.calls[1][0].data;
    expect(a.calendarEventId).toBe(b.calendarEventId);
    expect(a.calendarSyncStatus).toBe(b.calendarSyncStatus);
    // syncedAt may differ by clock; both are dates.
    expect(a.calendarSyncedAt).toBeInstanceOf(Date);
    expect(b.calendarSyncedAt).toBeInstanceOf(Date);
  });
});

// ─── Executors ──────────────────────────────────────────────────────

const sampleOp: CalendarSyncOp = {
  taskId: "task-1",
  userId: "user-1",
  kind: "upsert",
  providerEventId: null,
  providerId: "ios_eventkit",
  targetCalendarId: "cal-work-1",
  taskTitle: "Buy gift",
  dueDateISO: TOMORROW.toISOString(),
  duration: "TIMED",
};

describe("NoopExecutor", () => {
  it("returns ok=true with a synthetic event id on upsert", async () => {
    const ex = new NoopExecutor();
    const r = await ex.execute(sampleOp);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.providerEventId).toMatch(/^noop-event-/);
  });

  it("echoes back providerEventId on delete", async () => {
    const ex = new NoopExecutor();
    const r = await ex.execute({
      ...sampleOp,
      kind: "delete",
      providerEventId: "evt-existing",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.providerEventId).toBe("evt-existing");
  });

  it("preserves providerEventId on follow-up upsert", async () => {
    const ex = new NoopExecutor();
    const r = await ex.execute({ ...sampleOp, providerEventId: "evt-existing" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.providerEventId).toBe("evt-existing");
  });
});

describe("MobileQueueExecutor", () => {
  it("returns ok=true without inventing a real eventId for fresh upserts", async () => {
    const ex = new MobileQueueExecutor();
    const r = await ex.execute(sampleOp);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // Empty string — apply phase preserves prior eventId via the
    // route handler that consumes mobile's eventual report. Real
    // eventId only appears when mobile flushes the queue.
    expect(r.providerEventId).toBe("");
  });

  it("preserves prior providerEventId on follow-up ops", async () => {
    const ex = new MobileQueueExecutor();
    const r = await ex.execute({ ...sampleOp, providerEventId: "evt-prior" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.providerEventId).toBe("evt-prior");
  });
});

// ─── Stuck-task escalation ──────────────────────────────────────────

describe("selectStuckTaskIds", () => {
  it("returns ids where createdAt is older than the threshold", () => {
    const oldTask = {
      id: "old",
      calendarSyncedAt: null,
      createdAt: new Date(NOW.getTime() - PENDING_ESCALATION_MS - 1000),
    };
    const freshTask = {
      id: "fresh",
      calendarSyncedAt: null,
      createdAt: new Date(NOW.getTime() - 1 * 60 * 60 * 1000),
    };
    const ids = selectStuckTaskIds([oldTask, freshTask], NOW);
    expect(ids).toEqual(["old"]);
  });

  it("uses calendarSyncedAt when set (e.g. partial success re-entered PENDING)", () => {
    const partial = {
      id: "partial",
      calendarSyncedAt: new Date(NOW.getTime() - PENDING_ESCALATION_MS - 1000),
      // createdAt is recent — the prior success was older
      createdAt: new Date(NOW.getTime() - 1000),
    };
    const ids = selectStuckTaskIds([partial], NOW);
    expect(ids).toEqual(["partial"]);
  });

  it("returns empty list when all tasks are within the threshold", () => {
    const ids = selectStuckTaskIds(
      [
        {
          id: "fresh",
          calendarSyncedAt: null,
          createdAt: new Date(NOW.getTime() - 1000),
        },
      ],
      NOW
    );
    expect(ids).toEqual([]);
  });

  it("respects a custom threshold", () => {
    const task = {
      id: "fast",
      calendarSyncedAt: null,
      createdAt: new Date(NOW.getTime() - 5 * 60 * 1000),
    };
    // 1-minute threshold — should escalate.
    const ids = selectStuckTaskIds([task], NOW, 60 * 1000);
    expect(ids).toEqual(["fast"]);
  });
});
