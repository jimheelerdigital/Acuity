/**
 * Plan my day (1.9.6): the on-device scheduler and the calendar-sync rule
 * that keeps a planned block in place when the task changes.
 */
import { describe, expect, it } from "vitest";

import { eventForOp, type DrainOp } from "../../../../mobile/lib/calendar-op";
import {
  busyIntervals,
  clampSettings,
  nextBlockMinutes,
  planDay,
  planWindow,
  roundUpToSlot,
} from "../../../../mobile/lib/plan-day";
import { selectTodayTasks, type TodayTaskInput } from "../../../../mobile/lib/today-tasks";

const at = (h: number, m = 0) => new Date(2026, 9, 23, h, m, 0, 0);
const task = (id: string, over: Partial<TodayTaskInput> = {}): TodayTaskInput => ({
  id,
  title: `Task ${id}`,
  text: null,
  status: "OPEN",
  priority: "MEDIUM",
  dueDate: "2026-10-23T00:00:00.000Z",
  snoozedUntil: null,
  ...over,
});
const fmt = (d: Date) => `${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;

describe("busyIntervals", () => {
  it("ignores all-day and Ripple's own events, merges overlaps", () => {
    const busy = busyIntervals([
      { title: "Standup", start: at(9), end: at(9, 30), allDay: false },
      { title: "1:1", start: at(9, 15), end: at(10), allDay: false },
      { title: "Holiday", start: at(0), end: at(23, 59), allDay: true },
      { title: "Ripple: Call mom", start: at(11), end: at(12), allDay: false },
      { title: "✓ Ripple: Done thing", start: at(13), end: at(14), allDay: false },
    ]);
    expect(busy).toEqual([{ start: at(9).getTime(), end: at(10).getTime() }]);
  });
});

describe("planDay", () => {
  const tasks = selectTodayTasks(
    [task("a", { priority: "HIGH" }), task("b"), task("c", { dueDate: "2026-10-21T00:00:00.000Z" })],
    at(8)
  );

  it("fills the earliest free gaps in TODAY order (overdue first)", () => {
    const busy = busyIntervals([{ title: "Standup", start: at(9), end: at(9, 45), allDay: false }]);
    const plan = planDay(tasks, busy, { now: at(8) });
    const byId = Object.fromEntries(plan.blocks.map((b) => [b.task.id, `${fmt(b.start)}-${fmt(b.end)}`]));
    expect(byId).toEqual({ c: "9:45-10:15", a: "10:15-10:45", b: "10:45-11:15" });
    expect(plan.unscheduled).toEqual([]);
  });

  it("never starts before now (rounded to the quarter hour)", () => {
    const plan = planDay(tasks, [], { now: at(13, 7) });
    expect(fmt(plan.blocks[0].start)).toBe("13:15");
  });

  it("a shorter task takes a gap a longer one skipped", () => {
    const busy = busyIntervals([{ title: "Mtg", start: at(9, 30), end: at(11), allDay: false }]);
    const plan = planDay(tasks, busy, {
      now: at(8),
      minutesFor: (id) => (id === "c" ? 60 : 30),
    });
    const byId = Object.fromEntries(plan.blocks.map((b) => [b.task.id, fmt(b.start)]));
    expect(byId.c).toBe("11:00"); // 60 min doesn't fit 9:00–9:30
    expect(byId.a).toBe("9:00"); // 30 min does
  });

  it("returns what doesn't fit before the workday ends", () => {
    const plan = planDay(tasks, [], { now: at(17, 20), settings: { startHour: 9, endHour: 18 } });
    expect(plan.blocks.map((b) => b.task.id)).toEqual(["c"]);
    expect(plan.unscheduled.map((t) => t.task.id)).toEqual(["a", "b"]);
  });

  it("after the workday everything is unscheduled", () => {
    const plan = planDay(tasks, [], { now: at(19) });
    expect(plan.window).toBeNull();
    expect(plan.unscheduled).toHaveLength(3);
  });

  it("blocks never overlap busy time or each other", () => {
    const busy = busyIntervals([
      { title: "A", start: at(9, 10), end: at(9, 50), allDay: false },
      { title: "B", start: at(10, 5), end: at(12, 40), allDay: false },
    ]);
    const plan = planDay(tasks, busy, { now: at(8) });
    const all = [...busy, ...plan.blocks.map((b) => ({ start: b.start.getTime(), end: b.end.getTime() }))]
      .sort((x, y) => x.start - y.start);
    for (let i = 1; i < all.length; i++) expect(all[i].start).toBeGreaterThanOrEqual(all[i - 1].end);
  });
});

describe("helpers", () => {
  it("roundUpToSlot", () => {
    expect(fmt(new Date(roundUpToSlot(at(9, 0).getTime())))).toBe("9:00");
    expect(fmt(new Date(roundUpToSlot(at(9, 1).getTime())))).toBe("9:15");
    expect(fmt(new Date(roundUpToSlot(at(9, 50).getTime())))).toBe("10:00");
  });
  it("planWindow starts at the workday start before it begins", () => {
    expect(fmt(planWindow(at(6), { startHour: 9, endHour: 18 })!.start)).toBe("9:00");
  });
  it("duration chip cycles 15→30→45→60→90→15", () => {
    expect([15, 30, 45, 60, 90].map(nextBlockMinutes)).toEqual([30, 45, 60, 90, 15]);
  });
  it("clampSettings keeps end after start", () => {
    expect(clampSettings({ startHour: 10, endHour: 9 })).toEqual({ startHour: 10, endHour: 11 });
  });
});

describe("eventForOp keeps a planned block", () => {
  const op = (over: Partial<DrainOp> = {}): DrainOp => ({
    taskId: "t1",
    kind: "upsert",
    providerEventId: "e1",
    targetCalendarId: "c1",
    taskTitle: "Write report",
    dueDateISO: "2026-10-23T00:00:00.000Z",
    duration: "ALL_DAY",
    ...over,
  });
  const block = { day: "2026-10-23", start: at(14).toISOString(), end: at(14, 30).toISOString() };

  it("uses the block instead of an all-day event", () => {
    const e = eventForOp(op(), block)!;
    expect(e.allDay).toBe(false);
    expect(e.start.getTime()).toBe(at(14).getTime());
  });
  it("completed task keeps its block and gets a ✓", () => {
    const e = eventForOp(op({ kind: "complete" }), block)!;
    expect(e.title).toBe("✓ Ripple: Write report");
    expect(e.start.getTime()).toBe(at(14).getTime());
  });
  it("an overdue task planned today keeps the block", () => {
    expect(eventForOp(op({ dueDateISO: "2026-10-20T00:00:00.000Z" }), block)!.allDay).toBe(false);
  });
  it("moving the due date to a later day drops the block", () => {
    expect(eventForOp(op({ dueDateISO: "2026-10-25T00:00:00.000Z" }), block)!.allDay).toBe(true);
  });
  it("no block → the usual event", () => {
    expect(eventForOp(op(), null)!.allDay).toBe(true);
  });
});
