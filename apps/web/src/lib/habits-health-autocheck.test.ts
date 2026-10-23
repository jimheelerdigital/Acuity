import { describe, expect, it } from "vitest";

import { healthRuleMet, parseHealthRule } from "@acuity/shared";

import { healthChecksToWrite } from "./habits-health-autocheck";

describe("parseHealthRule", () => {
  it("accepts the two v1 metrics within limits", () => {
    expect(parseHealthRule({ metric: "steps", threshold: 10000 })).toEqual({
      metric: "steps",
      comparator: ">=",
      threshold: 10000,
    });
    expect(parseHealthRule({ metric: "activeMinutes", comparator: ">=", threshold: 30 })?.threshold).toBe(30);
  });
  it("rejects anything else", () => {
    for (const bad of [
      null,
      "steps",
      { metric: "sleepHours", threshold: 7 },
      { metric: "steps", threshold: 10 }, // below min
      { metric: "steps", threshold: 1e9 },
      { metric: "steps", comparator: "<", threshold: 10000 },
      { metric: "activeMinutes", threshold: Number.NaN },
    ]) {
      expect(parseHealthRule(bad)).toBeNull();
    }
  });
  it("met = value at or over the threshold; missing data never meets", () => {
    const r = parseHealthRule({ metric: "steps", threshold: 10000 })!;
    expect(healthRuleMet(r, { steps: 10000 })).toBe(true);
    expect(healthRuleMet(r, { steps: 9999 })).toBe(false);
    expect(healthRuleMet(r, { steps: null })).toBe(false);
    expect(healthRuleMet(r, {})).toBe(false);
  });
});

describe("healthChecksToWrite", () => {
  const everyDay = [0, 1, 2, 3, 4, 5, 6];
  // 2026-10-24 is a Saturday, 2026-10-23 a Friday.
  const days = [
    { date: "2026-10-23", steps: 12000, activeMinutes: 20 },
    { date: "2026-10-24", steps: 4000, activeMinutes: 45 },
  ];

  it("checks the days a rule is met", () => {
    const writes = healthChecksToWrite(
      [
        { id: "walk", daysActive: everyDay, autoRule: { metric: "steps", comparator: ">=", threshold: 10000 } },
        { id: "move", daysActive: everyDay, autoRule: { metric: "activeMinutes", comparator: ">=", threshold: 30 } },
      ],
      days
    );
    expect(writes).toEqual([
      { habitId: "walk", localDate: "2026-10-23" },
      { habitId: "move", localDate: "2026-10-24" },
    ]);
  });

  it("skips days the habit isn't expected", () => {
    const weekdays = [1, 2, 3, 4, 5];
    const writes = healthChecksToWrite(
      [{ id: "move", daysActive: weekdays, autoRule: { metric: "activeMinutes", threshold: 30 } }],
      days
    );
    expect(writes).toEqual([]); // the 45-minute day is a Saturday
  });

  it("ignores habits without a valid rule", () => {
    expect(
      healthChecksToWrite(
        [
          { id: "a", daysActive: everyDay, autoRule: null },
          { id: "b", daysActive: everyDay, autoRule: { metric: "sleepHours", threshold: 7 } },
        ],
        days
      )
    ).toEqual([]);
  });
});
