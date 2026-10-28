import { describe, expect, it } from "vitest";

import {
  BUSY_EVENT_COUNT,
  MAX_PER_SIDE,
  computeLiftsDrains,
  type HabitInput,
  type MoodDay,
} from "./lifts-drains";

/** 2026-10-01 is a Thursday. Builds consecutive local days. */
function day(i: number): string {
  const d = new Date(Date.UTC(2026, 9, 1 + i));
  return d.toISOString().slice(0, 10);
}

function mk(n: number, f: (i: number) => Partial<MoodDay>): MoodDay[] {
  return Array.from({ length: n }, (_, i) => ({
    date: day(i),
    mood: 5,
    themes: [],
    people: [],
    ...f(i),
  }));
}

const run = (days: MoodDay[], habits: HabitInput[] = [], eventsByDay: Map<string, number> | null = null) =>
  computeLiftsDrains({ days, habits, eventsByDay });

describe("computeLiftsDrains", () => {
  it("shows nothing below 10 scored days", () => {
    const r = run(mk(9, (i) => (i % 2 ? { themes: ["Sleep"], mood: 8 } : { mood: 3 })));
    expect(r).toEqual({ lifts: [], drains: [], scoredDays: 9 });
  });

  it("finds a theme lift and a person drain with with/without averages", () => {
    const days = mk(12, (i) =>
      i < 5
        ? { themes: ["Gym"], mood: 8 }
        : i < 9
          ? { people: ["Alex"], mood: 3 }
          : { mood: 5 }
    );
    const r = run(days);
    expect(r.lifts).toHaveLength(1);
    expect(r.lifts[0]).toMatchObject({ kind: "theme", label: "Gym", withAvg: 8, withDays: 5, withoutDays: 7 });
    expect(r.lifts[0].observation).toBe(
      "On days Gym came up, your mood tended to be higher (8 vs 3.9)."
    );
    expect(r.drains[0]).toMatchObject({ kind: "person", label: "Alex", direction: "drain", withDays: 4 });
    expect(r.drains[0].observation).toContain("you mentioned Alex");
  });

  it("needs 4 days on each side", () => {
    // Theme on only 3 days: ignored even with a huge gap.
    const r = run(mk(12, (i) => (i < 3 ? { themes: ["Rare"], mood: 10 } : { mood: 4 })));
    expect(r.lifts).toEqual([]);
  });

  it("ignores gaps under 0.75 points", () => {
    const r = run(mk(12, (i) => (i < 6 ? { themes: ["Work"], mood: 5.5 } : { mood: 5 })));
    expect(r.lifts).toEqual([]);
    expect(r.drains).toEqual([]);
  });

  it("merges theme spellings case-insensitively and labels with the common one", () => {
    const days = mk(12, (i) =>
      i < 6 ? { themes: [i === 0 ? "sleep" : "Sleep"], mood: 8 } : { mood: 4 }
    );
    expect(run(days).lifts[0].label).toBe("Sleep");
  });

  it("compares habits only on expected days since creation", () => {
    const allDays = [0, 1, 2, 3, 4, 5, 6];
    const days = mk(14, () => ({}));
    const checkedDates = new Set<string>();
    days.forEach((d, i) => {
      if (i % 2 === 0) {
        checkedDates.add(d.date);
        d.mood = 8;
      } else {
        d.mood = 4;
      }
    });
    const habit: HabitInput = { name: "Walk", daysActive: allDays, createdDate: day(0), archivedDate: null, checkedDates };
    const r = run(days, [habit]);
    expect(r.lifts[0]).toMatchObject({ kind: "habit", label: "Walk", withDays: 7, withoutDays: 7 });
    expect(r.lifts[0].observation).toContain("than days you skipped it");

    // Created on day 10 → only 4 eligible days; 2 done → not enough per side.
    const late = { ...habit, createdDate: day(10) };
    expect(run(days, [late]).lifts).toEqual([]);
  });

  it("skips calendar when not connected, and only uses days since the first event", () => {
    const days = mk(14, (i) => ({ mood: i >= 4 && i % 2 === 0 ? 3 : 7 }));
    expect(run(days, [], null).drains).toEqual([]);

    const ev = new Map<string, number>();
    for (let i = 4; i < 14; i++) ev.set(day(i), i % 2 === 0 ? BUSY_EVENT_COUNT + 1 : 1);
    const r = run(days, [], ev);
    expect(r.drains[0]).toMatchObject({ kind: "calendar", withDays: 5, withoutDays: 5, withAvg: 3, withoutAvg: 7 });
  });

  it("caps each side and puts the biggest gap first", () => {
    const days = mk(20, (i) => ({
      mood: i < 10 ? 8 : 3,
      themes: i < 10 ? ["A", "B", "C", "D"].slice(0, (i % 4) + 1) : [],
    }));
    const r = run(days);
    expect(r.lifts.length).toBeLessThanOrEqual(MAX_PER_SIDE);
    const gaps = r.lifts.map((l) => l.withAvg - l.withoutAvg);
    expect([...gaps].sort((a, b) => b - a)).toEqual(gaps);
  });

  it("keeps one row when a theme and a person share a name", () => {
    const days = mk(12, (i) => (i < 5 ? { themes: ["Mom"], people: ["Mom"], mood: 9 } : { mood: 4 }));
    const r = run(days);
    expect(r.lifts.filter((l) => l.label === "Mom")).toHaveLength(1);
  });

  // ── Energy (2026-10-27) ─────────────────────────────────────────────
  it("finds an energy-only lift when mood doesn't move", () => {
    const days = mk(12, (i) =>
      i < 6 ? { themes: ["Gym"], mood: 6, energy: 8 } : { mood: 6, energy: 5 }
    );
    const r = run(days);
    expect(r.lifts).toHaveLength(1);
    expect(r.lifts[0]).toMatchObject({ label: "Gym", metric: "energy", withAvg: 8, withoutAvg: 5, also: null });
    expect(r.lifts[0].observation).toBe(
      "On days Gym came up, your energy tended to be higher (8 vs 5)."
    );
  });

  it("shows a factor once when mood and energy both qualify, ranked by the larger gap", () => {
    const days = mk(12, (i) =>
      i < 6
        ? { themes: ["Gym"], mood: 7, energy: 9 }
        : { mood: 5, energy: 5 }
    );
    const r = run(days);
    expect(r.lifts).toHaveLength(1);
    const f = r.lifts[0];
    expect(f.metric).toBe("energy"); // gap 4 beats mood's gap 2
    expect(f.also).toMatchObject({ metric: "mood", withAvg: 7, withoutAvg: 5 });
    expect(f.observation).toBe(
      "On days Gym came up, your energy tended to be higher (9 vs 5) and your mood too (7 vs 5)."
    );
  });

  it("says so when mood and energy move in opposite directions", () => {
    const days = mk(12, (i) =>
      i < 6 ? { themes: ["Work"], mood: 4, energy: 8 } : { mood: 7, energy: 5 }
    );
    const f = [...run(days).lifts, ...run(days).drains][0];
    expect(f.observation).toBe(
      "On days Work came up, your mood tended to be lower (4 vs 7), while your energy tended to be higher (8 vs 5)."
    );
  });

  it("ignores energy without 10 energy-scored days of its own", () => {
    const days = mk(12, (i) => ({
      themes: i < 6 ? ["Gym"] : [],
      mood: 6,
      energy: i < 9 ? (i < 6 ? 9 : 4) : null,
    }));
    const r = run(days);
    expect(r.lifts).toEqual([]);
    expect(r.drains).toEqual([]);
  });
});

