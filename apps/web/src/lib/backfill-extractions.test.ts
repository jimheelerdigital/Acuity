import { describe, expect, it } from "vitest";

import {
  BACKFILL_WINDOW_RECENT_DAYS,
  backfillWindowCutoff,
  isBackfillEligible,
  selectBackfillCandidates,
  type BackfillCandidate,
} from "./backfill-extractions";

const NOW = new Date("2026-05-02T12:00:00Z");

const day = (n: number) =>
  new Date(NOW.getTime() + n * 24 * 60 * 60 * 1000);

const candidate = (
  overrides: Partial<BackfillCandidate> = {}
): BackfillCandidate => ({
  id: "e1",
  extracted: false,
  rawAnalysis: null,
  status: "COMPLETE",
  transcript: "Today was decent.",
  createdAt: day(-3),
  ...overrides,
});

describe("backfillWindowCutoff", () => {
  it("recent → gt cutoff at now - 60d", () => {
    const cutoff = backfillWindowCutoff("recent", NOW);
    expect(cutoff.gt).toBeInstanceOf(Date);
    expect(cutoff.lte).toBeUndefined();
    const expectedMs =
      NOW.getTime() - BACKFILL_WINDOW_RECENT_DAYS * 24 * 60 * 60 * 1000;
    expect(cutoff.gt!.getTime()).toBe(expectedMs);
  });

  it("older → lte cutoff at now - 60d", () => {
    const cutoff = backfillWindowCutoff("older", NOW);
    expect(cutoff.lte).toBeInstanceOf(Date);
    expect(cutoff.gt).toBeUndefined();
  });
});

describe("isBackfillEligible", () => {
  it("happy path — fresh recent FREE-tier entry passes", () => {
    expect(isBackfillEligible(candidate(), "recent", NOW)).toBe(true);
  });

  it("rejects already-extracted entries", () => {
    expect(
      isBackfillEligible(candidate({ extracted: true }), "recent", NOW)
    ).toBe(false);
  });

  it("rejects entries with rawAnalysis already set (historical PRO)", () => {
    expect(
      isBackfillEligible(
        candidate({ rawAnalysis: { themes: ["work"] } }),
        "recent",
        NOW
      )
    ).toBe(false);
  });

  it("rejects FAILED entries (don't loop on broken transcripts)", () => {
    expect(
      isBackfillEligible(candidate({ status: "FAILED" }), "recent", NOW)
    ).toBe(false);
  });

  it("rejects PARTIAL entries", () => {
    expect(
      isBackfillEligible(candidate({ status: "PARTIAL" }), "recent", NOW)
    ).toBe(false);
  });

  it("rejects QUEUED entries (still processing)", () => {
    expect(
      isBackfillEligible(candidate({ status: "QUEUED" }), "recent", NOW)
    ).toBe(false);
  });

  it("rejects entries with no transcript", () => {
    expect(
      isBackfillEligible(candidate({ transcript: null }), "recent", NOW)
    ).toBe(false);
  });

  it("rejects entries with whitespace-only transcript", () => {
    expect(
      isBackfillEligible(candidate({ transcript: "   \n\n  " }), "recent", NOW)
    ).toBe(false);
  });

  it("rejects entries older than 60d when window=recent", () => {
    expect(
      isBackfillEligible(candidate({ createdAt: day(-90) }), "recent", NOW)
    ).toBe(false);
  });

  it("includes 60d+ old entries when window=older", () => {
    expect(
      isBackfillEligible(candidate({ createdAt: day(-90) }), "older", NOW)
    ).toBe(true);
  });

  it("excludes recent entries when window=older", () => {
    expect(
      isBackfillEligible(candidate({ createdAt: day(-3) }), "older", NOW)
    ).toBe(false);
  });
});

describe("selectBackfillCandidates", () => {
  it("partitions a mixed cohort by window", () => {
    const cohort: BackfillCandidate[] = [
      candidate({ id: "fresh-eligible", createdAt: day(-3) }),
      candidate({ id: "old-not-recent", createdAt: day(-90) }),
      candidate({
        id: "fresh-but-extracted",
        createdAt: day(-3),
        extracted: true,
      }),
      candidate({
        id: "fresh-but-has-raw",
        createdAt: day(-3),
        rawAnalysis: { x: 1 },
      }),
      candidate({ id: "fresh-but-failed", createdAt: day(-3), status: "FAILED" }),
    ];
    const recent = selectBackfillCandidates(cohort, "recent", NOW);
    expect(recent.map((c) => c.id)).toEqual(["fresh-eligible"]);

    const older = selectBackfillCandidates(cohort, "older", NOW);
    expect(older.map((c) => c.id)).toEqual(["old-not-recent"]);
  });

  it("returns empty array on empty input", () => {
    expect(selectBackfillCandidates([], "recent", NOW)).toEqual([]);
  });
});
