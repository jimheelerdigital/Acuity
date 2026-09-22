import { describe, expect, it } from "vitest";

import {
  categoryForReminderKind,
  hhmmToMinutes,
  isCategoryEnabled,
  isWithinQuietHours,
  parseSemver,
  semverGte,
  serverOwnsReminders,
} from "@acuity/shared";

describe("hhmmToMinutes", () => {
  it("parses valid times", () => {
    expect(hhmmToMinutes("00:00")).toBe(0);
    expect(hhmmToMinutes("09:30")).toBe(570);
    expect(hhmmToMinutes("23:59")).toBe(1439);
  });
  it("rejects malformed times", () => {
    expect(hhmmToMinutes("24:00")).toBeNull();
    expect(hhmmToMinutes("9:30")).toBeNull();
    expect(hhmmToMinutes("")).toBeNull();
    expect(hhmmToMinutes("abc")).toBeNull();
  });
});

describe("isWithinQuietHours", () => {
  it("handles a same-day window", () => {
    expect(isWithinQuietHours("13:00", "09:00", "17:00")).toBe(true);
    expect(isWithinQuietHours("08:59", "09:00", "17:00")).toBe(false);
    expect(isWithinQuietHours("17:00", "09:00", "17:00")).toBe(false); // end exclusive
  });
  it("wraps past midnight (21:00 -> 09:00)", () => {
    expect(isWithinQuietHours("22:00", "21:00", "09:00")).toBe(true);
    expect(isWithinQuietHours("03:00", "21:00", "09:00")).toBe(true);
    expect(isWithinQuietHours("08:59", "21:00", "09:00")).toBe(true);
    expect(isWithinQuietHours("09:00", "21:00", "09:00")).toBe(false); // end exclusive
    expect(isWithinQuietHours("12:00", "21:00", "09:00")).toBe(false);
  });
  it("treats an empty (start==end) window as never quiet", () => {
    expect(isWithinQuietHours("12:00", "09:00", "09:00")).toBe(false);
  });
  it("returns false on malformed input rather than suppressing", () => {
    expect(isWithinQuietHours("bad", "21:00", "09:00")).toBe(false);
  });
});

describe("isCategoryEnabled", () => {
  it("is true only when present", () => {
    expect(isCategoryEnabled(["habit_reminder"], "habit_reminder")).toBe(true);
    expect(isCategoryEnabled(["habit_reminder"], "habit_nudge")).toBe(false);
    expect(isCategoryEnabled([], "habit_reminder")).toBe(false);
    expect(isCategoryEnabled(null, "habit_reminder")).toBe(false);
    expect(isCategoryEnabled(undefined, "habit_reminder")).toBe(false);
  });
});

describe("semver helpers", () => {
  it("parses versions", () => {
    expect(parseSemver("1.6.0")).toEqual([1, 6, 0]);
    expect(parseSemver("1.6")).toEqual([1, 6, 0]);
    expect(parseSemver("1.6.2-beta.1")).toEqual([1, 6, 2]);
    expect(parseSemver(null)).toBeNull();
    expect(parseSemver("garbage")).toBeNull();
  });
  it("compares tuples", () => {
    expect(semverGte([1, 6, 0], [1, 6, 0])).toBe(true);
    expect(semverGte([1, 6, 1], [1, 6, 0])).toBe(true);
    expect(semverGte([2, 0, 0], [1, 6, 0])).toBe(true);
    expect(semverGte([1, 5, 9], [1, 6, 0])).toBe(false);
  });
});

describe("serverOwnsReminders (version gate, fails closed)", () => {
  it("is true for 1.6.0 and up", () => {
    expect(serverOwnsReminders("1.6.0")).toBe(true);
    expect(serverOwnsReminders("1.6.1")).toBe(true);
    expect(serverOwnsReminders("2.0.0")).toBe(true);
  });
  it("is false for older builds", () => {
    expect(serverOwnsReminders("1.5.9")).toBe(false);
    expect(serverOwnsReminders("1.0.0")).toBe(false);
  });
  it("fails closed on unknown/missing version (never risks a double-send)", () => {
    expect(serverOwnsReminders(null)).toBe(false);
    expect(serverOwnsReminders(undefined)).toBe(false);
    expect(serverOwnsReminders("")).toBe(false);
    expect(serverOwnsReminders("not-a-version")).toBe(false);
  });
});

describe("categoryForReminderKind", () => {
  it("maps kinds to categories", () => {
    expect(categoryForReminderKind("debrief")).toBe("habit_reminder");
    expect(categoryForReminderKind("habit")).toBe("habit_nudge");
  });
});
