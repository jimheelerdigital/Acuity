import { describe, it, expect } from "vitest";
import { getPatternLabels, type Branch } from "./funnel-config";

function makeAnswers(overrides: Record<string, string | string[]> = {}): Record<string, string | string[]> {
  return {
    shared_q5: "A few months",
    branch_q6: "My energy",
    ...overrides,
  };
}

describe("getPatternLabels", () => {
  // ─── Primary pattern mapping (one per branch) ───────────────────────────
  const branchExpected: [Branch, string][] = [
    ["overload", "Mental Overload"],
    ["patterns", "Relational Looping"],
    ["rumination", "Racing Mind"],
    ["stuck", "System Fatigue"],
    ["mask", "Invisible Load"],
  ];

  for (const [branch, expected] of branchExpected) {
    it(`maps branch "${branch}" → primary "${expected}"`, () => {
      const result = getPatternLabels(branch, makeAnswers());
      expect(result.primary).toBe(expected);
      expect(result.loopLine).toBeTruthy();
      expect(result.bodyCopy).toBeTruthy();
    });
  }

  // ─── Area mapping — v6 has no branch_q6→area map yet, so every branch
  //     falls back to its per-branch default (areaFallback=true). ──────────
  const areaDefaultExpected: [Branch, string][] = [
    ["overload", "Energy"],
    ["patterns", "Relationships"],
    ["rumination", "Peace of mind"],
    ["stuck", "Momentum"],
    ["mask", "Identity"],
  ];

  for (const [branch, expected] of areaDefaultExpected) {
    it(`falls back to default area "${expected}" for branch "${branch}"`, () => {
      const result = getPatternLabels(branch, makeAnswers());
      expect(result.area).toBe(expected);
      expect(result.areaFallback).toBe(true);
    });
  }

  // ─── Secondary: no Q9 source in v6 — only the long-duration override ────
  it("has no secondary for short/medium durations", () => {
    const result = getPatternLabels("overload", makeAnswers({ shared_q5: "A few months" }));
    expect(result.secondary).toBeNull();
    expect(result.secondaryVisible).toBe(false);
    expect(result.stuckDeepOverride).toBe(false);
    expect(result.collisionSuppressed).toBe(false);
  });

  // ─── Duration override → "Stuck Deep" ──────────────────────────────────
  it("overrides secondary to 'Stuck Deep' when duration is 'Over a year'", () => {
    const result = getPatternLabels("overload", makeAnswers({ shared_q5: "Over a year" }));
    expect(result.secondary).toBe("Stuck Deep");
    expect(result.secondaryVisible).toBe(true);
    expect(result.stuckDeepOverride).toBe(true);
    expect(result.collisionSuppressed).toBe(false);
  });

  it("overrides secondary to 'Stuck Deep' when duration is 'I can\u2019t remember when it started'", () => {
    const result = getPatternLabels("patterns", makeAnswers({ shared_q5: "I can\u2019t remember when it started" }));
    expect(result.secondary).toBe("Stuck Deep");
    expect(result.stuckDeepOverride).toBe(true);
  });

  it("does NOT override for short durations", () => {
    const result = getPatternLabels("overload", makeAnswers({ shared_q5: "A few weeks" }));
    expect(result.secondary).toBeNull();
    expect(result.stuckDeepOverride).toBe(false);
  });

  // ─── Body copy is pattern-specific (anti-Barnum) ───────────────────────
  it("returns different body copy for different branches", () => {
    const overload = getPatternLabels("overload", makeAnswers());
    const mask = getPatternLabels("mask", makeAnswers());
    expect(overload.bodyCopy).not.toBe(mask.bodyCopy);
    expect(overload.loopLine).not.toBe(mask.loopLine);
  });

  // ─── Area fallback observability ───────────────────────────────────────
  it("sets areaFallback=true (no branch_q6→area map wired yet) even with a real answer", () => {
    const result = getPatternLabels("overload", makeAnswers({ branch_q6: "My health" }));
    expect(result.area).toBe("Energy"); // per-branch default
    expect(result.areaFallback).toBe(true);
  });

  it("sets areaFallback=true and area=default when branch_q6 is empty", () => {
    const result = getPatternLabels("overload", makeAnswers({ branch_q6: "" }));
    expect(result.area).toBe("Energy");
    expect(result.areaFallback).toBe(true);
  });
});
