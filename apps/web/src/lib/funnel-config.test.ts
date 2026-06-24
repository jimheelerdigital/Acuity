import { describe, it, expect } from "vitest";
import { getPatternLabels, type Branch } from "./funnel-config";

function makeAnswers(overrides: Record<string, string | string[]> = {}): Record<string, string | string[]> {
  return {
    shared_q5: "A few months",
    shared_q6: "My energy",
    shared_q9: "Snapping at people I love, then feeling guilty",
    ...overrides,
  };
}

describe("getPatternLabels", () => {
  // ─── Primary pattern mapping (one per branch) ───────────────────────────
  const branchExpected: [Branch, string][] = [
    ["blur", "Mental Overload"],
    ["patterns", "Relational Looping"],
    ["rumination", "Racing Mind"],
    ["graveyard", "System Fatigue"],
    ["mask", "Invisible Load"],
    ["drift", "Drifted Off-Course"],
  ];

  for (const [branch, expected] of branchExpected) {
    it(`maps branch "${branch}" → primary "${expected}"`, () => {
      const result = getPatternLabels(branch, makeAnswers());
      expect(result.primary).toBe(expected);
      expect(result.loopLine).toBeTruthy();
      expect(result.bodyCopy).toBeTruthy();
    });
  }

  // ─── Secondary pattern mapping (from shared_q9) ────────────────────────
  const q9Expected: [string, string][] = [
    ["Snapping at people I love, then feeling guilty", "Overflow"],
    ["Putting everyone else first until I have nothing left", "Last on the List"],
    ["Starting things and watching them fizzle", "Follow-Through Decay"],
    ["Replaying the same worries on a loop", "Rumination Spiral"],
  ];

  for (const [q9, expected] of q9Expected) {
    it(`maps q9 "${q9.slice(0, 30)}…" → secondary "${expected}"`, () => {
      const result = getPatternLabels("blur", makeAnswers({ shared_q9: q9 }));
      expect(result.secondary).toBe(expected);
      expect(result.secondaryVisible).toBe(true);
      expect(result.stuckDeepOverride).toBe(false);
    });
  }

  // ─── Area mapping (from shared_q6) ─────────────────────────────────────
  const q6Expected: [string, string][] = [
    ["My energy", "Energy"],
    ["My relationships", "Relationships"],
    ["My health", "Health"],
    ["My career", "Career"],
    ["My sense of self", "Identity"],
    ["Time I can\u2019t get back", "Time"],
  ];

  for (const [q6, expected] of q6Expected) {
    it(`maps q6 "${q6}" → area "${expected}"`, () => {
      const result = getPatternLabels("blur", makeAnswers({ shared_q6: q6 }));
      expect(result.area).toBe(expected);
    });
  }

  // ─── Duration override → "Stuck Deep" ──────────────────────────────────
  it("overrides secondary to 'Stuck Deep' when duration is 'Over a year'", () => {
    const result = getPatternLabels("blur", makeAnswers({ shared_q5: "Over a year" }));
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
    const result = getPatternLabels("blur", makeAnswers({ shared_q5: "A few weeks" }));
    expect(result.secondary).toBe("Overflow");
    expect(result.stuckDeepOverride).toBe(false);
  });

  // ─── Collision: Racing Mind + Rumination Spiral ─────────────────────────
  it("suppresses secondary when Racing Mind collides with Rumination Spiral (short duration)", () => {
    const result = getPatternLabels("rumination", makeAnswers({
      shared_q9: "Replaying the same worries on a loop",
      shared_q5: "A few months",
    }));
    expect(result.primary).toBe("Racing Mind");
    expect(result.secondary).toBeNull();
    expect(result.secondaryVisible).toBe(false);
    expect(result.collisionSuppressed).toBe(true);
    expect(result.stuckDeepOverride).toBe(false);
  });

  it("falls through to Stuck Deep when Racing Mind collides with Rumination Spiral AND duration qualifies", () => {
    const result = getPatternLabels("rumination", makeAnswers({
      shared_q9: "Replaying the same worries on a loop",
      shared_q5: "Over a year",
    }));
    expect(result.primary).toBe("Racing Mind");
    expect(result.secondary).toBe("Stuck Deep");
    expect(result.secondaryVisible).toBe(true);
    expect(result.stuckDeepOverride).toBe(true);
    // Duration override takes precedence — collision check never fires
    expect(result.collisionSuppressed).toBe(false);
  });

  // ─── Non-colliding combos are visible ───────────────────────────────────
  it("shows secondary for non-colliding combos (Racing Mind + Overflow)", () => {
    const result = getPatternLabels("rumination", makeAnswers({
      shared_q9: "Snapping at people I love, then feeling guilty",
      shared_q5: "A few months",
    }));
    expect(result.primary).toBe("Racing Mind");
    expect(result.secondary).toBe("Overflow");
    expect(result.secondaryVisible).toBe(true);
    expect(result.collisionSuppressed).toBe(false);
  });

  // ─── Body copy is pattern-specific (anti-Barnum) ───────────────────────
  it("returns different body copy for different branches", () => {
    const blur = getPatternLabels("blur", makeAnswers());
    const mask = getPatternLabels("mask", makeAnswers());
    expect(blur.bodyCopy).not.toBe(mask.bodyCopy);
    expect(blur.loopLine).not.toBe(mask.loopLine);
  });

  // ─── Area fallback observability ───────────────────────────────────────
  it("sets areaFallback=false when q6 has a real answer", () => {
    const result = getPatternLabels("blur", makeAnswers({ shared_q6: "My health" }));
    expect(result.area).toBe("Health");
    expect(result.areaFallback).toBe(false);
  });

  it("sets areaFallback=true and area='Energy' when q6 is empty", () => {
    const result = getPatternLabels("blur", makeAnswers({ shared_q6: "" }));
    expect(result.area).toBe("Energy");
    expect(result.areaFallback).toBe(true);
  });
});
