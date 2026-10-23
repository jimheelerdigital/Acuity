/**
 * Apple Health device layer (1.9.6): HealthKit results → the daily rows the
 * phone sends to POST /api/health/snapshots.
 */
import { describe, expect, it } from "vitest";

import {
  buildSnapshots,
  byLocalDay,
  lastLocalDays,
  sleepHoursByDay,
} from "../../../../mobile/lib/health-aggregate";

const at = (d: number, h: number, m = 0) => new Date(2026, 9, d, h, m, 0, 0);

describe("lastLocalDays", () => {
  it("is the last N local days, oldest first", () => {
    expect(lastLocalDays(at(23, 9), 3)).toEqual(["2026-10-21", "2026-10-22", "2026-10-23"]);
  });
  it("crosses a month boundary", () => {
    expect(lastLocalDays(new Date(2026, 10, 1, 8), 2)).toEqual(["2026-10-31", "2026-11-01"]);
  });
});

describe("byLocalDay", () => {
  it("keys statistics by the interval's local start day; skips empties", () => {
    const m = byLocalDay([
      { startDate: at(22, 0), value: 8123 },
      { startDate: at(23, 0), value: undefined },
    ]);
    expect([...m.entries()]).toEqual([["2026-10-22", 8123]]);
  });
});

describe("sleepHoursByDay", () => {
  it("counts asleep stages toward the wake-up day, not in-bed or awake", () => {
    const m = sleepHoursByDay([
      { startDate: at(22, 23), endDate: at(23, 2), value: 3 }, // core 3h
      { startDate: at(23, 2), endDate: at(23, 3), value: 2 }, // awake
      { startDate: at(23, 3), endDate: at(23, 7), value: 5 }, // REM 4h
      { startDate: at(22, 22, 30), endDate: at(23, 7), value: 0 }, // in bed
    ]);
    expect(m.get("2026-10-23")).toBeCloseTo(7, 5);
    expect(m.has("2026-10-22")).toBe(false);
  });
  it("merges iPhone + Watch overlap instead of double counting", () => {
    const m = sleepHoursByDay([
      { startDate: at(22, 23), endDate: at(23, 6), value: 1 }, // phone 7h
      { startDate: at(23, 0), endDate: at(23, 7), value: 3 }, // watch 7h, overlapping
    ]);
    expect(m.get("2026-10-23")).toBeCloseTo(8, 5);
  });
});

describe("buildSnapshots", () => {
  const empty = () => new Map<string, number>();
  it("one row per day with data; null for metrics with none (never 0)", () => {
    const rows = buildSnapshots(["2026-10-22", "2026-10-23"], {
      steps: new Map([["2026-10-23", 10432.6]]),
      activeMinutes: new Map([["2026-10-23", 31.4]]),
      sleepHours: empty(),
      hrv: new Map([["2026-10-23", 42.36]]),
    });
    expect(rows).toEqual([
      { date: "2026-10-23", steps: 10433, activeMinutes: 31, sleepHours: null, avgHRV: 42.4 },
    ]);
  });
  it("stays inside the server's limits", () => {
    const rows = buildSnapshots(["2026-10-23"], {
      steps: new Map([["2026-10-23", 9e9]]),
      activeMinutes: new Map([["2026-10-23", 5000]]),
      sleepHours: new Map([["2026-10-23", 30]]),
      hrv: new Map([["2026-10-23", 900]]),
    });
    expect(rows[0]).toEqual({ date: "2026-10-23", steps: 500000, activeMinutes: 1440, sleepHours: 24, avgHRV: 500 });
  });
});
