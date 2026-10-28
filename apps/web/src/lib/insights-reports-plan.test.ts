import { describe, expect, it, vi } from "vitest";

import type { WrappedSummary } from "@acuity/shared";

import {
  defaultWrappedPeriod,
  failSoft,
  finishTimeLabel,
  formatAverage,
  reportsPlan,
  showFollowThrough,
  showHowYouTalk,
  showLiftsDrains,
  showOpenLoops,
  showWrapped,
  wrappedCardCopy,
} from "./insights-reports-plan";

describe("reportsPlan: same gates as the iPhone cards", () => {
  it("first read only before Pattern Insights unlocks; lifts & drains never then", () => {
    expect(reportsPlan({ patternInsightsUnlocked: false, hasProEntitlement: true })).toEqual({
      firstRead: true,
      liftsDrains: false,
      followThrough: true,
      openLoops: true,
      howYouTalk: true,
    });
  });

  it("lifts & drains needs the unlock AND the Pro/trial entitlement", () => {
    expect(reportsPlan({ patternInsightsUnlocked: true, hasProEntitlement: true }).liftsDrains).toBe(true);
    expect(reportsPlan({ patternInsightsUnlocked: true, hasProEntitlement: false }).liftsDrains).toBe(false);
    expect(reportsPlan({ patternInsightsUnlocked: true, hasProEntitlement: true }).firstRead).toBe(false);
  });
});

describe("failSoft", () => {
  it("returns the value", async () => {
    expect(await failSoft(async () => 3, "x")).toBe(3);
  });

  it("returns null and reports the label on error, so one card can't break the page", async () => {
    const onError = vi.fn();
    expect(await failSoft(async () => { throw new Error("db down"); }, "open-loops", onError)).toBeNull();
    expect(onError).toHaveBeenCalledWith("open-loops", expect.any(Error));
  });
});

describe("show* checks hide cards without data", () => {
  it("follow-through: null report hides", () => {
    expect(showFollowThrough(null)).toBe(false);
  });

  it("open loops: empty list hides", () => {
    expect(showOpenLoops([])).toBe(false);
    expect(
      showOpenLoops([{ kind: "quiet_goal", goalId: "g", label: "Run", text: "t", daysQuiet: 30 }])
    ).toBe(true);
  });

  it("lifts & drains: needs at least one finding", () => {
    expect(showLiftsDrains({ lifts: [], drains: [], scoredDays: 20 })).toBe(false);
  });

  it("how you talk: needs enough data AND a shift", () => {
    expect(showHowYouTalk({ periodDays: 30, enoughData: false, shifts: [] })).toBe(false);
    expect(showHowYouTalk({ periodDays: 30, enoughData: true, shifts: [] })).toBe(false);
    expect(
      showHowYouTalk({
        periodDays: 30,
        enoughData: true,
        shifts: [{ group: "stress", word: "stressed", direction: "down", text: "less" }],
      })
    ).toBe(true);
  });

  it("wrapped: needs eligible", () => {
    expect(showWrapped({ eligible: false } as WrappedSummary)).toBe(false);
  });
});

describe("copy helpers", () => {
  it("finish times", () => {
    expect(finishTimeLabel(0.4)).toBe("same day");
    expect(finishTimeLabel(1)).toBe("1 day");
    expect(finishTimeLabel(3.6)).toBe("4 days");
  });

  it("averages", () => {
    expect(formatAverage(7)).toBe("7");
    expect(formatAverage(6.54)).toBe("6.5");
  });

  it("wrapped card copy matches the app", () => {
    const w = {
      period: { key: "2026-10", kind: "month", label: "October 2026" },
      entries: 9,
      topThemes: [{ theme: "Work", entries: 4 }],
      habitStreak: { habit: "Walk", days: 5 },
    } as WrappedSummary;
    expect(wrappedCardCopy(w)).toEqual({
      title: "Your October, wrapped",
      sub: "9 debriefs · mostly work · 5-day streak",
    });
    const y = { ...w, period: { key: "2026", kind: "year", label: "Your 2026" }, habitStreak: null } as WrappedSummary;
    expect(wrappedCardCopy(y).title).toBe("Your 2026, wrapped");
  });
});

describe("defaultWrappedPeriod", () => {
  it("uses the card's offer inside the window", () => {
    expect(defaultWrappedPeriod("2026-11-03")).toEqual({ kind: "month", year: 2026, month: 10 });
    expect(defaultWrappedPeriod("2026-12-20")).toEqual({ kind: "year", year: 2026 });
  });

  it("falls back to last month outside it (and wraps January)", () => {
    expect(defaultWrappedPeriod("2026-10-27")).toEqual({ kind: "month", year: 2026, month: 9 });
    expect(defaultWrappedPeriod("2027-01-20")).toEqual({ kind: "month", year: 2026, month: 12 });
  });
});
