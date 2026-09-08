import { describe, expect, it } from "vitest";

import {
  currentStreak,
  dayOfWeek,
  habitsForToday,
  isExpectedOn,
  isPaused,
  shiftDate,
} from "@acuity/shared";

const EVERY_DAY = [0, 1, 2, 3, 4, 5, 6];
const WEEKDAYS = [1, 2, 3, 4, 5];

const habit = (over: Partial<{ daysActive: number[]; archivedAt: string | null }> = {}) => ({
  id: "h1",
  name: "Walk",
  daysActive: EVERY_DAY,
  archivedAt: null,
  ...over,
});

describe("calendar helpers", () => {
  it("maps a date to the right weekday", () => {
    // 2026-08-21 is a Friday.
    expect(dayOfWeek("2026-08-21")).toBe(5);
    expect(dayOfWeek("2026-08-23")).toBe(0); // Sunday
  });

  it("does not shift with the runtime timezone", () => {
    // The string IS the local date; parsing it as an instant would move it
    // for anyone not on UTC.
    expect(dayOfWeek("2026-01-01")).toBe(4);
  });

  it("steps across a month boundary", () => {
    expect(shiftDate("2026-08-01", -1)).toBe("2026-07-31");
    expect(shiftDate("2026-08-31", 1)).toBe("2026-09-01");
  });

  it("steps across a leap day", () => {
    expect(shiftDate("2028-03-01", -1)).toBe("2028-02-29");
  });
});

describe("streaks", () => {
  it("counts consecutive completed days", () => {
    const checks = new Set(["2026-08-21", "2026-08-20", "2026-08-19"]);
    expect(currentStreak(habit(), checks, "2026-08-21")).toBe(3);
  });

  it("does NOT reset just because today is not done yet", () => {
    // The day is not over. Showing 0 every morning to someone on a 30-day
    // run is both wrong and demoralising.
    const checks = new Set(["2026-08-20", "2026-08-19"]);
    expect(currentStreak(habit(), checks, "2026-08-21")).toBe(2);
  });

  it("breaks on a genuinely missed day", () => {
    const checks = new Set(["2026-08-21", "2026-08-19"]);
    expect(currentStreak(habit(), checks, "2026-08-21")).toBe(1);
  });

  it("SKIPS days the habit is not expected rather than breaking", () => {
    // A weekdays-only habit must not lose its streak every Saturday —
    // that punishes the user for the schedule they chose.
    // Fri 21st, Thu 20th, Wed 19th... weekend of 22-23 is not expected.
    const checks = new Set([
      "2026-08-21", // Fri
      "2026-08-20", // Thu
      "2026-08-19", // Wed
      "2026-08-18", // Tue
      "2026-08-17", // Mon
      "2026-08-14", // Fri (weekend skipped)
    ]);
    expect(currentStreak(habit({ daysActive: WEEKDAYS }), checks, "2026-08-21")).toBe(6);
  });

  it("is zero with no checks at all", () => {
    expect(currentStreak(habit(), new Set(), "2026-08-21")).toBe(0);
  });

  it("terminates on a paused habit instead of looping the lookback", () => {
    // daysActive [] means nothing is ever expected; the loop must not spin
    // to maxLookback doing nothing useful and must return 0.
    expect(currentStreak(habit({ daysActive: [] }), new Set(), "2026-08-21")).toBe(0);
  });

  it("respects the lookback bound", () => {
    // Every day checked for a long time — bounded, not infinite.
    const checks = new Set<string>();
    let d = "2026-08-21";
    for (let i = 0; i < 500; i += 1) {
      checks.add(d);
      d = shiftDate(d, -1);
    }
    expect(currentStreak(habit(), checks, "2026-08-21", 30)).toBe(30);
  });
});

describe("today's list", () => {
  it("includes only habits expected today", () => {
    const list = [
      habit(),
      { ...habit(), id: "h2", daysActive: [0] }, // Sundays only
    ];
    // 2026-08-21 is a Friday.
    expect(habitsForToday(list, "2026-08-21").map((h) => h.id)).toEqual(["h1"]);
  });

  it("never includes an archived habit", () => {
    const list = [habit({ archivedAt: "2026-08-01T00:00:00.000Z" })];
    expect(habitsForToday(list, "2026-08-21")).toHaveLength(0);
  });

  it("treats an empty schedule as paused, not archived", () => {
    // Distinct states: paused keeps its history and can be resumed.
    const h = habit({ daysActive: [] });
    expect(isPaused(h)).toBe(true);
    expect(isExpectedOn(h, "2026-08-21")).toBe(false);
    expect(habitsForToday([h], "2026-08-21")).toHaveLength(0);
  });
});

describe("caps are separate, not shared", () => {
  it("habit nudges do not spend debrief-reminder slots", async () => {
    // Jim's decision: habit nudges get their own type and their own cap so
    // adding a habit can never evict someone's evening reflection.
    const { MAX_HABIT_REMINDERS, MAX_ACTIVE_HABITS } = await import("@acuity/shared");
    expect(MAX_HABIT_REMINDERS).toBe(3);
    // Distinct from the debrief cap of 5 enforced in
    // /api/account/reminders — deliberately not the same number, and
    // deliberately not the same counter.
    expect(MAX_HABIT_REMINDERS).not.toBe(5);
    expect(MAX_ACTIVE_HABITS).toBeGreaterThan(MAX_HABIT_REMINDERS);
  });
});
