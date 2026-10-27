import { describe, expect, it } from "vitest";

import {
  bestStreak,
  currentStreak,
  MAX_BANKED_FREEZES,
  shiftDate,
  streakState,
} from "@acuity/shared";

/**
 * Streak freezes (2026-10-27): derived purely from check history.
 * 7 consecutive completed expected days bank 1 freeze (max 2); a single
 * missed expected day spends one and the streak survives; a miss right
 * after a frozen day breaks the streak.
 */
const EVERY_DAY = [0, 1, 2, 3, 4, 5, 6];
const WEEKDAYS = [1, 2, 3, 4, 5];
const TODAY = "2026-10-27"; // a Tuesday
const habit = (over: Partial<{ daysActive: number[]; createdAt: string }> = {}) => ({
  id: "h1",
  name: "Walk",
  daysActive: EVERY_DAY,
  archivedAt: null,
  createdAt: "2026-09-01",
  ...over,
});

/** Checked dates for `n` consecutive days ending `end` (inclusive). */
function run(end: string, n: number): string[] {
  return Array.from({ length: n }, (_, i) => shiftDate(end, -i));
}
const set = (...groups: string[][]) => new Set(groups.flat());

describe("earning", () => {
  it("banks one freeze after 7 consecutive days, none before", () => {
    expect(streakState(habit(), set(run(TODAY, 6)), TODAY).freezesBanked).toBe(0);
    expect(streakState(habit(), set(run(TODAY, 7)), TODAY).freezesBanked).toBe(1);
  });

  it("caps the bank at 2", () => {
    const s = streakState(habit(), set(run(TODAY, 30)), TODAY);
    expect(MAX_BANKED_FREEZES).toBe(2);
    expect(s.freezesBanked).toBe(2);
    expect(s.streak).toBe(30);
  });

  it("does not bank anything when the habit is newer than the history", () => {
    const s = streakState(habit({ createdAt: shiftDate(TODAY, -2) }), set(run(TODAY, 20)), TODAY);
    expect(s.streak).toBe(3);
    expect(s.freezesBanked).toBe(0);
  });
});

describe("spending", () => {
  it("covers a single missed day and keeps the streak going", () => {
    const yesterday = shiftDate(TODAY, -1);
    // 7 done, then a miss yesterday, then today done.
    const checks = set(run(shiftDate(TODAY, -2), 7), [TODAY]);
    const s = streakState(habit(), checks, TODAY);
    expect(s.frozenDates.has(yesterday)).toBe(true);
    expect(s.streak).toBe(8); // the frozen day keeps it alive but isn't counted
    expect(s.freezesBanked).toBe(0);
  });

  it("an unchecked today plus a frozen yesterday still shows the streak", () => {
    const checks = set(run(shiftDate(TODAY, -2), 7));
    expect(currentStreak(habit(), checks, TODAY)).toBe(7);
  });

  it("never covers two misses in a row, even with freezes banked", () => {
    // 14 done (2 freezes), then two consecutive misses, then today done.
    const checks = set(run(shiftDate(TODAY, -3), 14), [TODAY]);
    const s = streakState(habit(), checks, TODAY);
    expect(s.streak).toBe(1);
    expect(s.frozenDates.size).toBe(1);
    expect(s.freezesBanked).toBe(1); // earned freezes survive the break
  });

  it("with no freeze banked a miss breaks the streak as before", () => {
    const checks = set(run(shiftDate(TODAY, -2), 5), [TODAY]);
    expect(currentStreak(habit(), checks, TODAY)).toBe(1);
  });
});

describe("schedule and today", () => {
  it("ignores unscheduled days (weekend is not a miss and doesn't spend a freeze)", () => {
    // Weekdays only: every weekday for the last 4 weeks.
    const checks = new Set<string>();
    for (let i = 0; i < 28; i += 1) {
      const d = shiftDate(TODAY, -i);
      const dow = new Date(`${d}T00:00:00Z`).getUTCDay();
      if (dow >= 1 && dow <= 5) checks.add(d);
    }
    const s = streakState(habit({ daysActive: WEEKDAYS }), checks, TODAY);
    expect(s.frozenDates.size).toBe(0);
    expect(s.streak).toBe(checks.size);
    expect(s.freezesBanked).toBe(2);
  });

  it("an unchecked today is in progress, never a miss", () => {
    const s = streakState(habit(), set(run(shiftDate(TODAY, -1), 7)), TODAY);
    expect(s.streak).toBe(7);
    expect(s.frozenDates.size).toBe(0);
    expect(s.freezesBanked).toBe(1);
  });

  it("best is never below current", () => {
    const checks = set(run(shiftDate(TODAY, -2), 7), [TODAY]);
    expect(bestStreak(habit(), checks, TODAY)).toBeGreaterThanOrEqual(
      currentStreak(habit(), checks, TODAY)
    );
  });
});
