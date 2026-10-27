import { describe, expect, it } from "vitest";

import {
  DAY_MS,
  computeFollowThrough,
  similarity,
  type FollowThroughTask,
} from "./follow-through";

const NOW = new Date("2026-10-27T12:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * DAY_MS);

let seq = 0;
function task(p: Partial<FollowThroughTask> & { created: number; done?: number }): FollowThroughTask {
  seq++;
  return {
    id: `t${seq}`,
    title: p.title ?? `Task ${seq}`,
    text: null,
    status: p.done !== undefined ? "DONE" : p.status ?? "OPEN",
    entryId: p.entryId === undefined ? `e${seq}` : p.entryId,
    groupId: p.groupId ?? null,
    createdAt: daysAgo(p.created),
    completedAt: p.done !== undefined ? daysAgo(p.done) : null,
  };
}

describe("similarity", () => {
  it("matches rephrasings of the same task", () => {
    expect(similarity("Call the bank about the mortgage", "call bank re mortgage")).toBeGreaterThanOrEqual(0.6);
  });
  it("needs a shared word of 4+ letters, not just short filler", () => {
    expect(similarity("Pay tax bill", "Pay tax")).toBeLessThan(0.6);
    expect(similarity("Too new", "Also too new")).toBe(0);
  });
  it("does not match different tasks that share a word", () => {
    expect(similarity("Call the bank", "Call mom")).toBeLessThan(0.6);
  });
  it("short titles only match exactly", () => {
    expect(similarity("Groceries", "groceries!")).toBe(1);
    expect(similarity("Groceries", "Laundry")).toBe(0);
  });
});

describe("computeFollowThrough", () => {
  it("returns null below the minimum of 3 tasks captured in 14 days", () => {
    expect(computeFollowThrough([task({ created: 1 }), task({ created: 2 }), task({ created: 20 })], [], NOW)).toBeNull();
  });

  it("counts captured / from recordings / completed per rolling week", () => {
    const tasks = [
      task({ created: 1 }),
      task({ created: 2, entryId: null }),
      task({ created: 3, done: 1 }),
      task({ created: 9 }),
      task({ created: 10, done: 8 }),
    ];
    const r = computeFollowThrough(tasks, [], NOW)!;
    expect(r.thisWeek).toEqual({ captured: 3, fromRecordings: 2, completed: 1 });
    expect(r.lastWeek).toEqual({ captured: 2, fromRecordings: 2, completed: 1 });
  });

  it("reports median days to finish only for groups with 3+ completions", () => {
    const g = [
      { id: "work", name: "Work" },
      { id: "home", name: "Home" },
    ];
    const tasks = [
      task({ created: 10, done: 8, groupId: "work" }), // 2d
      task({ created: 6, done: 5, groupId: "work" }), // 1d
      task({ created: 12, done: 2, groupId: "work" }), // 10d
      task({ created: 5, done: 1, groupId: "home" }),
      task({ created: 4, done: 1, groupId: "home" }),
      task({ created: 1 }),
    ];
    const r = computeFollowThrough(tasks, g, NOW)!;
    expect(r.groupSpeed).toEqual([{ group: "Work", medianDays: 2, completed: 3 }]);
  });

  it("flags an open task repeated across two recordings", () => {
    const tasks = [
      task({ created: 12, title: "Call the bank about the mortgage", entryId: "eA" }),
      task({ created: 2, title: "call bank re mortgage", entryId: "eB" }),
      task({ created: 1, title: "Buy dog food" }),
    ];
    const r = computeFollowThrough(tasks, [], NOW)!;
    expect(r.stillOpen.kind).toBe("repeated");
    expect(r.stillOpen.items).toHaveLength(1);
    expect(r.stillOpen.items[0]).toMatchObject({ title: "call bank re mortgage", mentions: 2 });
  });

  it("does not call it repeated when both came from the same recording", () => {
    const tasks = [
      task({ created: 12, title: "Call the bank about the mortgage", entryId: "eA" }),
      task({ created: 12, title: "call bank re mortgage", entryId: "eA" }),
      task({ created: 1 }),
    ];
    const r = computeFollowThrough(tasks, [], NOW)!;
    expect(r.stillOpen.kind).toBe("oldest");
  });

  it("does not flag a repeat that was completed after it was captured", () => {
    const tasks = [
      task({ created: 12, title: "Call the bank about the mortgage", entryId: "eA" }),
      task({ created: 5, title: "call bank re mortgage", entryId: "eB", done: 3 }),
      task({ created: 1, title: "Buy dog food" }),
    ];
    const r = computeFollowThrough(tasks, [], NOW)!;
    // The day-12 task's twin was finished on day 3 → not "still open, repeated".
    expect(r.stillOpen.kind).not.toBe("repeated");
  });

  it("falls back to the oldest open recording tasks (7+ days), making no repeat claim", () => {
    const tasks = [
      task({ created: 30, title: "Renew passport" }),
      task({ created: 9, title: "Fix the gate" }),
      task({ created: 2, title: "Too new" }),
      task({ created: 1, title: "Also too new" }),
      task({ created: 40, title: "Typed by hand", entryId: null }),
    ];
    const r = computeFollowThrough(tasks, [], NOW)!;
    expect(r.stillOpen.kind).toBe("oldest");
    expect(r.stillOpen.items.map((i) => i.title)).toEqual(["Renew passport", "Fix the gate"]);
    expect(r.stillOpen.items.every((i) => i.mentions === 1)).toBe(true);
  });
});
