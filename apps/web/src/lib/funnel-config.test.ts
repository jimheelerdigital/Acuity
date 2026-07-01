import { describe, it, expect } from "vitest";
import { getPatternLabels, type Branch } from "./funnel-config";

function makeAnswers(overrides: Record<string, string | string[]> = {}): Record<string, string | string[]> {
  return {
    shared_q5: "Months",
    branch_q6: "My energy",
    ...overrides,
  };
}

describe("getPatternLabels", () => {
  // ─── Primary pattern mapping (one per branch) ───────────────────────────
  const branchExpected: [Branch, string][] = [
    ["overload", "Cognitive Overload"],
    ["patterns", "The Cycle"],
    ["rumination", "The Loop"],
    ["stuck", "The Treadmill"],
    ["mask", "The Mask"],
  ];

  for (const [branch, expected] of branchExpected) {
    it(`maps branch "${branch}" → primary "${expected}"`, () => {
      const result = getPatternLabels(branch, makeAnswers());
      expect(result.primary).toBe(expected);
      expect(result.loopLine).toBeTruthy();
      expect(result.bodyCopy).toBeTruthy();
    });
  }

  // ─── Area mapping — falls back to per-branch default when branch_q6 has no
  //     explicit area mapping (areaFallback=true). ──────────────────────────
  const areaDefaultExpected: [Branch, string][] = [
    ["overload", "Peace of mind"],
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

  // ─── Secondary: no Q9 source — only the long-duration override ──────────
  it("has no secondary for short/medium durations", () => {
    const result = getPatternLabels("overload", makeAnswers({ shared_q5: "Months" }));
    expect(result.secondary).toBeNull();
    expect(result.secondaryVisible).toBe(false);
    expect(result.stuckDeepOverride).toBe(false);
    expect(result.collisionSuppressed).toBe(false);
  });

  // ─── Duration override → "Stuck Deep" ──────────────────────────────────
  it("overrides secondary to 'Stuck Deep' when duration is 'Years'", () => {
    const result = getPatternLabels("overload", makeAnswers({ shared_q5: "Years" }));
    expect(result.secondary).toBe("Stuck Deep");
    expect(result.secondaryVisible).toBe(true);
    expect(result.stuckDeepOverride).toBe(true);
    expect(result.collisionSuppressed).toBe(false);
  });

  it("overrides secondary to 'Stuck Deep' when duration is 'As long as I can remember'", () => {
    const result = getPatternLabels("patterns", makeAnswers({ shared_q5: "As long as I can remember" }));
    expect(result.secondary).toBe("Stuck Deep");
    expect(result.stuckDeepOverride).toBe(true);
  });

  it("does NOT override for short durations", () => {
    const result = getPatternLabels("overload", makeAnswers({ shared_q5: "Days" }));
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
  it("sets areaFallback=true when branch_q6 has no area mapping", () => {
    const result = getPatternLabels("overload", makeAnswers({ branch_q6: "My health" }));
    expect(result.area).toBe("Peace of mind"); // per-branch default
    expect(result.areaFallback).toBe(true);
  });

  it("sets areaFallback=true and area=default when branch_q6 is empty", () => {
    const result = getPatternLabels("overload", makeAnswers({ branch_q6: "" }));
    expect(result.area).toBe("Peace of mind");
    expect(result.areaFallback).toBe(true);
  });

  // ─── Area mapping resolves a real Q6 option to its mapped area ─────────
  it("maps a known branch_q6 option to its area (areaFallback=false)", () => {
    const result = getPatternLabels("overload", makeAnswers({ branch_q6: "My confidence in myself" }));
    expect(result.area).toBe("Confidence");
    expect(result.areaFallback).toBe(false);
  });
});
