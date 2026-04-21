import { describe, expect, it } from "vitest";

import { coerceSentiment, normalizeThemeName } from "./themes";

describe("normalizeThemeName", () => {
  it("lowercases and trims", () => {
    expect(normalizeThemeName("  Stress  ")).toBe("stress");
  });

  it("collapses whitespace runs", () => {
    expect(normalizeThemeName("work   life  balance")).toBe(
      "work life balance"
    );
  });

  it("strips leading and trailing punctuation", () => {
    expect(normalizeThemeName("'stress,")).toBe("stress");
    expect(normalizeThemeName("... focus!")).toBe("focus");
  });

  it("preserves inner punctuation in compounds", () => {
    expect(normalizeThemeName("self-care")).toBe("self-care");
    expect(normalizeThemeName("9-to-5")).toBe("9-to-5");
  });

  it("stems -es plurals", () => {
    expect(normalizeThemeName("stresses")).toBe("stress");
    expect(normalizeThemeName("businesses")).toBe("business");
    expect(normalizeThemeName("boxes")).toBe("box");
  });

  it("stems -ies plurals", () => {
    expect(normalizeThemeName("worries")).toBe("worry");
    expect(normalizeThemeName("studies")).toBe("study");
  });

  it("only stems the last word in a multi-word theme", () => {
    expect(normalizeThemeName("career stresses")).toBe("career stress");
    expect(normalizeThemeName("daily worries")).toBe("daily worry");
  });

  it("does NOT stem singular words that end in s", () => {
    // The whole reason we dropped the generic -s rule: distinguishing
    // "focus" (singular) from "runs" (plural) without semantic knowledge
    // is a guessing game. Prefer under-stemming over hallucination.
    expect(normalizeThemeName("focus")).toBe("focus");
    expect(normalizeThemeName("bus")).toBe("bus");
    expect(normalizeThemeName("lens")).toBe("lens");
    expect(normalizeThemeName("process")).toBe("process");
    expect(normalizeThemeName("stress")).toBe("stress");
  });

  it("under-stems generic -s plurals (documented trade-off)", () => {
    // Side-effect of the decision above: "goals" stays "goals", "runs"
    // stays "runs". If Claude returns a mix of singular/plural for the
    // same concept they'll show up as separate nodes on the Theme Map.
    // Ship fix: add targeted rules when users report dup pairs.
    expect(normalizeThemeName("goals")).toBe("goals");
    expect(normalizeThemeName("runs")).toBe("runs");
  });

  it("returns empty for empty-ish inputs", () => {
    expect(normalizeThemeName("")).toBe("");
    expect(normalizeThemeName("   ")).toBe("");
    expect(normalizeThemeName("...")).toBe("");
    // Non-string coerces to empty safely.
    expect(normalizeThemeName(undefined as unknown as string)).toBe("");
  });
});

describe("coerceSentiment", () => {
  it("accepts canonical values", () => {
    expect(coerceSentiment("POSITIVE")).toBe("POSITIVE");
    expect(coerceSentiment("NEGATIVE")).toBe("NEGATIVE");
    expect(coerceSentiment("NEUTRAL")).toBe("NEUTRAL");
  });

  it("upper-cases + trims", () => {
    expect(coerceSentiment("  positive ")).toBe("POSITIVE");
  });

  it("accepts short-form alias", () => {
    expect(coerceSentiment("pos")).toBe("POSITIVE");
    expect(coerceSentiment("neg")).toBe("NEGATIVE");
  });

  it("falls back to NEUTRAL for unknown", () => {
    expect(coerceSentiment("sorta positive")).toBe("NEUTRAL");
    expect(coerceSentiment(null)).toBe("NEUTRAL");
    expect(coerceSentiment(undefined)).toBe("NEUTRAL");
    expect(coerceSentiment(1)).toBe("NEUTRAL");
  });
});
