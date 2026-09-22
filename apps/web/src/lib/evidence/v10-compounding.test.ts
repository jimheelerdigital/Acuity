import { describe, expect, it } from "vitest";

import {
  V10_COMPOUNDING_CARDS,
  assertHonestCompounding,
  type CompoundingCard,
} from "../../../../../apps/mobile/lib/onboarding-v10/compounding";
import {
  V10_BRANCHES,
  V10_BRANCH_ORDER,
  resolveObservationFallback,
} from "../../../../../apps/mobile/lib/onboarding-v10/branches";

/**
 * Guards the data-honesty rules in the v10 compounding strip. These are the
 * assertions that stop a well-meaning "make the three cards symmetrical" edit
 * from inventing a Life Matrix gate that does not exist.
 *
 * Lives in the web test suite because that is where vitest is configured;
 * the modules under test are pure data + pure functions with no RN imports.
 */

describe("compounding strip — honest thresholds", () => {
  it("passes the honesty guard as shipped", () => {
    expect(() => assertHonestCompounding()).not.toThrow();
  });

  it("does NOT gate Life Matrix — it exists at 0 entries", () => {
    const lm = V10_COMPOUNDING_CARDS.find((c) => c.key === "life_matrix")!;
    expect(lm.kind).toBe("sharpens");
    expect(lm.entriesNeeded).toBeNull();
    expect(lm.subline.toLowerCase()).not.toContain("unlock");
    // The verified truth: already present, value is sharpening.
    expect(lm.subline.toLowerCase()).toContain("already");
  });

  it("states the REAL weekly-report threshold and never promises a day", () => {
    const wr = V10_COMPOUNDING_CARDS.find((c) => c.key === "weekly_report")!;
    expect(wr.kind).toBe("threshold");
    expect(wr.entriesNeeded).toBe(9);
    // "Day 7" would be false for a light user — 9+ debriefs, median 37.
    expect(wr.subline.toLowerCase()).not.toMatch(/day 7|7 days|first week/);
  });

  it("promises patterns early, which prod data supports (~2 entries)", () => {
    const p = V10_COMPOUNDING_CARDS.find((c) => c.key === "patterns")!;
    expect(p.kind).toBe("threshold");
    expect(p.entriesNeeded).toBe(2);
  });

  it("REJECTS a fabricated Life Matrix gate", () => {
    const bad: CompoundingCard[] = [
      {
        key: "life_matrix",
        title: "Life Matrix",
        kind: "sharpens",
        entriesNeeded: 5, // the lie
        subline: "Unlocks at 5 debriefs.",
      },
    ];
    expect(() => assertHonestCompounding(bad)).toThrow(/not gated/i);
  });

  it("REJECTS 'unlock' wording on a non-gated surface", () => {
    const bad: CompoundingCard[] = [
      {
        key: "life_matrix",
        title: "Life Matrix",
        kind: "sharpens",
        entriesNeeded: null,
        subline: "Unlocks as you return.",
      },
    ];
    expect(() => assertHonestCompounding(bad)).toThrow(/unlock/i);
  });

  it("REJECTS a threshold card with no real number", () => {
    const bad: CompoundingCard[] = [
      {
        key: "weekly_report",
        title: "Weekly report",
        kind: "threshold",
        entriesNeeded: null,
        subline: "Coming soon.",
      },
    ];
    expect(() => assertHonestCompounding(bad)).toThrow(/real entry count/i);
  });
});

describe("v10 branches", () => {
  it("defines all six branches in spec order", () => {
    expect(V10_BRANCH_ORDER).toEqual([
      "overload",
      "patterns",
      "rumination",
      "stuck",
      "mask",
      "open",
    ]);
    for (const k of V10_BRANCH_ORDER) {
      const b = V10_BRANCHES[k];
      expect(b.card.length).toBeGreaterThan(0);
      expect(b.support.length).toBeGreaterThan(0);
      expect(b.mirror.length).toBeGreaterThan(0);
      expect(b.observationFallback.length).toBeGreaterThan(0);
    }
  });

  it("uses no banned vocabulary in any branch copy", () => {
    // Spec §1: never "brain dump", "journal entry", "check-in"; no
    // bedtime/nightly/ritual framing of the mechanism.
    const banned = /brain dump|journal entry|check-?in|bedtime|nightly|tonight|ritual/i;
    for (const k of V10_BRANCH_ORDER) {
      const b = V10_BRANCHES[k];
      for (const s of [b.card, b.support, b.mirror, b.observationFallback]) {
        expect(s).not.toMatch(banned);
      }
    }
  });

  it("substitutes a REAL task count into the {n} fallback", () => {
    expect(resolveObservationFallback("overload", 3)).toBe("3 things off your head. Nothing lost.");
  });

  it("never renders a literal {n} when the count is missing or zero", () => {
    for (const count of [null, 0, -1]) {
      const out = resolveObservationFallback("overload", count as number | null);
      expect(out).not.toContain("{n}");
      // Degrades to a line that claims nothing numeric.
      expect(out).toBe("Said once. Kept.");
    }
  });
});
