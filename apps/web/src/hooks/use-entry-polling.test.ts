import { describe, expect, it } from "vitest";

import { __internals_for_tests as fns } from "./use-entry-polling";

describe("use-entry-polling internals", () => {
  it("backoff schedule matches the spec (2s,2s,2s,4s,8s,15s,30s)", () => {
    expect(fns.BACKOFF_SCHEDULE_MS).toEqual([
      2000, 2000, 2000, 4000, 8000, 15_000, 30_000,
    ]);
  });

  it("nextDelay climbs through the schedule then plateaus at 30s", () => {
    expect(fns.nextDelay(0)).toBe(2000);
    expect(fns.nextDelay(1)).toBe(2000);
    expect(fns.nextDelay(2)).toBe(2000);
    expect(fns.nextDelay(3)).toBe(4000);
    expect(fns.nextDelay(4)).toBe(8000);
    expect(fns.nextDelay(5)).toBe(15_000);
    expect(fns.nextDelay(6)).toBe(30_000);
    // Plateau at 30s beyond the end of the schedule
    expect(fns.nextDelay(7)).toBe(30_000);
    expect(fns.nextDelay(100)).toBe(30_000);
  });

  it("wall-clock budget is 3 minutes", () => {
    expect(fns.MAX_WALL_CLOCK_MS).toBe(180_000);
  });

  it("recognizes terminal statuses", () => {
    expect(fns.isTerminal("COMPLETE")).toBe(true);
    expect(fns.isTerminal("FAILED")).toBe(true);
    expect(fns.isTerminal("PARTIAL")).toBe(true);
    expect(fns.isTerminal("QUEUED")).toBe(false);
    expect(fns.isTerminal("TRANSCRIBING")).toBe(false);
    expect(fns.isTerminal("EXTRACTING")).toBe(false);
    expect(fns.isTerminal("PERSISTING")).toBe(false);
    expect(fns.isTerminal("UNKNOWN")).toBe(false);
  });

  it("maps terminal statuses to the PollStatus enum", () => {
    expect(fns.mapTerminalToPollStatus("COMPLETE")).toBe("complete");
    expect(fns.mapTerminalToPollStatus("PARTIAL")).toBe("partial");
    expect(fns.mapTerminalToPollStatus("FAILED")).toBe("failed");
    // Fallthrough for non-terminal (shouldn't be called but safe):
    expect(fns.mapTerminalToPollStatus("QUEUED")).toBe("polling");
  });

  it("cumulative wall-clock at end of backoff is inside the 3-min budget", () => {
    // 2+2+2+4+8+15+30 = 63s — leaves 117s of 30s-plateau polling
    // before timeout. Sanity check the math rather than time-travelling
    // the whole loop.
    const sum = fns.BACKOFF_SCHEDULE_MS.reduce((a, b) => a + b, 0);
    expect(sum).toBe(63_000);
    expect(sum).toBeLessThan(fns.MAX_WALL_CLOCK_MS);
  });
});
