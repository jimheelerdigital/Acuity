import { describe, expect, it, vi } from "vitest";

import {
  allCapConditionsMet,
  CAP_REQUIRED_CYCLES,
  CAP_THRESHOLDS,
  checkAndIncrementFreeCap,
  evaluateFreeCap,
  FREE_CAP_PER_MONTH,
  nextMonthResetBoundary,
  shouldFlipCapOn,
} from "./free-cap";

const NOW = new Date("2026-05-15T12:00:00Z");

describe("nextMonthResetBoundary", () => {
  it("rolls to first millisecond of next UTC month", () => {
    const r = nextMonthResetBoundary(NOW);
    expect(r.toISOString()).toBe("2026-06-01T00:00:00.000Z");
  });

  it("handles December → January year rollover", () => {
    const r = nextMonthResetBoundary(new Date("2026-12-15T12:00:00Z"));
    expect(r.toISOString()).toBe("2027-01-01T00:00:00.000Z");
  });

  it("treats first-millisecond-of-month input as still that month", () => {
    const r = nextMonthResetBoundary(new Date("2026-05-01T00:00:00.000Z"));
    expect(r.toISOString()).toBe("2026-06-01T00:00:00.000Z");
  });
});

describe("evaluateFreeCap — window initialization", () => {
  it("first call ever → state=ok, newCount=1, sets reset boundary", () => {
    const r = evaluateFreeCap(null, null, NOW);
    expect(r.state).toBe("ok");
    expect(r.newCount).toBe(1);
    expect(r.newResetAt.toISOString()).toBe("2026-06-01T00:00:00.000Z");
  });

  it("undefined inputs treated same as null", () => {
    const r = evaluateFreeCap(undefined, undefined, NOW);
    expect(r.state).toBe("ok");
    expect(r.newCount).toBe(1);
  });

  it("expired window resets the count to 1", () => {
    const r = evaluateFreeCap(28, new Date("2026-05-01T00:00:00Z"), NOW);
    expect(r.state).toBe("ok");
    expect(r.newCount).toBe(1);
    expect(r.newResetAt.toISOString()).toBe("2026-06-01T00:00:00.000Z");
  });

  it("resetAt exactly === now is treated as expired", () => {
    const r = evaluateFreeCap(28, NOW, NOW);
    expect(r.state).toBe("ok");
    expect(r.newCount).toBe(1);
  });
});

describe("evaluateFreeCap — under cap (state=ok)", () => {
  const futureReset = new Date("2026-06-01T00:00:00Z");

  it("recording 1 (count=0) returns ok with newCount=1", () => {
    const r = evaluateFreeCap(0, futureReset, NOW);
    expect(r.state).toBe("ok");
    expect(r.newCount).toBe(1);
  });

  it("recording 15 (count=14) returns ok with newCount=15", () => {
    const r = evaluateFreeCap(14, futureReset, NOW);
    expect(r.state).toBe("ok");
    expect(r.newCount).toBe(15);
  });

  it("recording 29 (count=28) returns ok with newCount=29", () => {
    const r = evaluateFreeCap(28, futureReset, NOW);
    expect(r.state).toBe("ok");
    expect(r.newCount).toBe(29);
  });
});

describe("evaluateFreeCap — grace recording (state=grace)", () => {
  const futureReset = new Date("2026-06-01T00:00:00Z");

  it("recording 30 (count=29) returns grace — 'this one is on us'", () => {
    const r = evaluateFreeCap(29, futureReset, NOW);
    expect(r.state).toBe("grace");
    expect(r.newCount).toBe(FREE_CAP_PER_MONTH);
    expect(r.newResetAt).toEqual(futureReset);
  });
});

describe("evaluateFreeCap — blocked (state=blocked)", () => {
  const futureReset = new Date("2026-06-01T00:00:00Z");

  it("recording 31 (count=30) returns blocked, count unchanged", () => {
    const r = evaluateFreeCap(30, futureReset, NOW);
    expect(r.state).toBe("blocked");
    expect(r.newCount).toBe(30);
    expect(r.newResetAt).toEqual(futureReset);
  });

  it("recording 50 (count=49) still returns blocked, count unchanged", () => {
    const r = evaluateFreeCap(49, futureReset, NOW);
    expect(r.state).toBe("blocked");
    expect(r.newCount).toBe(49);
  });
});

describe("checkAndIncrementFreeCap (Prisma side-effect)", () => {
  function buildTx(
    user: {
      freeRecordingsThisMonth: number | null;
      freeRecordingsResetAt: Date | null;
    } | null
  ) {
    const findUnique = vi.fn().mockResolvedValue(user);
    const update = vi.fn().mockResolvedValue({});
    return {
      tx: {
        user: { findUnique, update },
      } as unknown as Parameters<typeof checkAndIncrementFreeCap>[0],
      findUnique,
      update,
    };
  }

  it("ok state writes the incremented counter", async () => {
    const { tx, update } = buildTx({
      freeRecordingsThisMonth: 14,
      freeRecordingsResetAt: new Date("2026-06-01T00:00:00Z"),
    });
    const state = await checkAndIncrementFreeCap(tx, "u1", NOW);
    expect(state).toBe("ok");
    expect(update).toHaveBeenCalledTimes(1);
    expect(update.mock.calls[0][0].data.freeRecordingsThisMonth).toBe(15);
  });

  it("grace state writes count=30", async () => {
    const { tx, update } = buildTx({
      freeRecordingsThisMonth: 29,
      freeRecordingsResetAt: new Date("2026-06-01T00:00:00Z"),
    });
    const state = await checkAndIncrementFreeCap(tx, "u1", NOW);
    expect(state).toBe("grace");
    expect(update.mock.calls[0][0].data.freeRecordingsThisMonth).toBe(
      FREE_CAP_PER_MONTH
    );
  });

  it("blocked state does NOT write — counter stays put", async () => {
    const { tx, update } = buildTx({
      freeRecordingsThisMonth: 30,
      freeRecordingsResetAt: new Date("2026-06-01T00:00:00Z"),
    });
    const state = await checkAndIncrementFreeCap(tx, "u1", NOW);
    expect(state).toBe("blocked");
    expect(update).not.toHaveBeenCalled();
  });

  it("missing user (stale session) returns ok and does NOT write", async () => {
    const { tx, update } = buildTx(null);
    const state = await checkAndIncrementFreeCap(tx, "u1", NOW);
    expect(state).toBe("ok");
    expect(update).not.toHaveBeenCalled();
  });
});

describe("allCapConditionsMet — gate logic", () => {
  it("all three over threshold → true", () => {
    expect(
      allCapConditionsMet({
        freeUserCount: 30_000,
        medianCadence: 0.8,
        conversionRate: 0.005,
      })
    ).toBe(true);
  });

  it("freeUserCount exactly at threshold → false (strict >)", () => {
    expect(
      allCapConditionsMet({
        freeUserCount: CAP_THRESHOLDS.freeUserCount,
        medianCadence: 0.8,
        conversionRate: 0.005,
      })
    ).toBe(false);
  });

  it("medianCadence exactly at threshold → true (>= 0.7)", () => {
    expect(
      allCapConditionsMet({
        freeUserCount: 30_000,
        medianCadence: CAP_THRESHOLDS.medianCadence,
        conversionRate: 0.005,
      })
    ).toBe(true);
  });

  it("conversionRate exactly at threshold → false (strict <)", () => {
    expect(
      allCapConditionsMet({
        freeUserCount: 30_000,
        medianCadence: 0.8,
        conversionRate: CAP_THRESHOLDS.conversionRate,
      })
    ).toBe(false);
  });

  it("conversionRate too high (1.5%) → false", () => {
    expect(
      allCapConditionsMet({
        freeUserCount: 30_000,
        medianCadence: 0.8,
        conversionRate: 0.015,
      })
    ).toBe(false);
  });

  it("medianCadence too low → false", () => {
    expect(
      allCapConditionsMet({
        freeUserCount: 30_000,
        medianCadence: 0.4,
        conversionRate: 0.005,
      })
    ).toBe(false);
  });
});

describe("shouldFlipCapOn — 7-cycle rule", () => {
  it("all 7 trailing evaluations met → true", () => {
    const evals = Array.from({ length: 7 }, () => ({
      allConditionsMet: true,
    }));
    expect(shouldFlipCapOn(evals)).toBe(true);
  });

  it("6 met + 1 missed → false (any cycle missed defeats trigger)", () => {
    const evals = [
      { allConditionsMet: true },
      { allConditionsMet: false },
      ...Array.from({ length: 5 }, () => ({ allConditionsMet: true })),
    ];
    expect(shouldFlipCapOn(evals)).toBe(false);
  });

  it("fewer than 7 cycles total → false (cron hasn't run long enough)", () => {
    const evals = Array.from({ length: 6 }, () => ({
      allConditionsMet: true,
    }));
    expect(shouldFlipCapOn(evals)).toBe(false);
  });

  it("0 cycles → false", () => {
    expect(shouldFlipCapOn([])).toBe(false);
  });

  it("considers only the trailing 7 when more provided", () => {
    const evals = [
      ...Array.from({ length: 7 }, () => ({ allConditionsMet: true })),
      { allConditionsMet: false }, // historical miss — should not affect
    ];
    expect(shouldFlipCapOn(evals)).toBe(true);
    expect(CAP_REQUIRED_CYCLES).toBe(7);
  });
});
