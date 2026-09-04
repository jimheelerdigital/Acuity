import { describe, expect, it } from "vitest";

import {
  CONFIRMED_MIN_CONFIDENCE,
  CONFIRMED_MIN_EVIDENCE,
  UNSOURCED_CONFIDENCE_CEILING,
  canSurfaceAsPattern,
  classifyInsightConfidence,
  normalizeCorrectionState,
  parseEvidenceFlag,
} from "@acuity/shared";

/**
 * The no-fabricated-patterns rule. These tests are the enforcement — if one
 * of them goes red, Ripple can claim a pattern it cannot evidence.
 */

describe("THE RULE — zero evidence can never be a pattern", () => {
  it("refuses to surface an insight with no source entries", () => {
    const v = classifyInsightConfidence({ evidenceCount: 0, modelConfidence: 0.99 });
    expect(v.tier).toBe("UNSOURCED");
    expect(v.surfaceAsPattern).toBe(false);
  });

  it("caps a confidently-fabricated insight's confidence", () => {
    const v = classifyInsightConfidence({ evidenceCount: 0, modelConfidence: 1 });
    expect(v.effectiveConfidence).toBeLessThanOrEqual(UNSOURCED_CONFIDENCE_CEILING);
  });

  it("flags the fabrication signature in its reasons", () => {
    const v = classifyInsightConfidence({ evidenceCount: 0, modelConfidence: 0.95 });
    expect(v.reasons.join(" ")).toContain("cited nothing");
  });

  it("is not overridable by ANY model confidence, swept 0..1", () => {
    for (let c = 0; c <= 1.0001; c += 0.05) {
      const v = classifyInsightConfidence({ evidenceCount: 0, modelConfidence: c });
      expect(v.surfaceAsPattern).toBe(false);
      expect(v.tier).toBe("UNSOURCED");
      expect(v.effectiveConfidence).toBeLessThanOrEqual(UNSOURCED_CONFIDENCE_CEILING);
    }
  });

  it("is not overridable by the user marking it ACCURATE", () => {
    const v = classifyInsightConfidence({
      evidenceCount: 0,
      modelConfidence: 0.99,
      correctionState: "ACCURATE",
    });
    // Truthful is not the same as evidenced — we still cannot show a receipt.
    expect(v.surfaceAsPattern).toBe(false);
    expect(v.tier).toBe("UNSOURCED");
    expect(v.reasons.join(" ")).toContain("cannot show receipts");
  });

  it("treats a null model confidence as 0, never as high", () => {
    const v = classifyInsightConfidence({ evidenceCount: 0, modelConfidence: null });
    expect(v.effectiveConfidence).toBe(0);
    expect(v.surfaceAsPattern).toBe(false);
  });

  it("treats legacy rows (null confidence, no evidence) as UNSOURCED", () => {
    // Every UserInsight written before this feature looks exactly like this.
    const v = classifyInsightConfidence({ evidenceCount: 0 });
    expect(v.tier).toBe("UNSOURCED");
    expect(v.surfaceAsPattern).toBe(false);
  });
});

describe("user refutation outranks evidence", () => {
  it("REFUTES a well-evidenced insight the user marked WRONG", () => {
    const v = classifyInsightConfidence({
      evidenceCount: 5,
      modelConfidence: 0.99,
      correctionState: "WRONG",
    });
    expect(v.tier).toBe("REFUTED");
    expect(v.surfaceAsPattern).toBe(false);
    expect(v.effectiveConfidence).toBe(0);
  });

  it("is case-insensitive on the correction value", () => {
    expect(
      classifyInsightConfidence({ evidenceCount: 3, modelConfidence: 0.9, correctionState: "wrong" }).tier
    ).toBe("REFUTED");
  });
});

describe("CONFIRMED requires both evidence and confidence", () => {
  it("confirms at the threshold", () => {
    const v = classifyInsightConfidence({
      evidenceCount: CONFIRMED_MIN_EVIDENCE,
      modelConfidence: CONFIRMED_MIN_CONFIDENCE,
    });
    expect(v.tier).toBe("CONFIRMED");
    expect(v.surfaceAsPattern).toBe(true);
  });

  it("withholds with enough confidence but only ONE source entry", () => {
    const v = classifyInsightConfidence({ evidenceCount: 1, modelConfidence: 0.99 });
    expect(v.tier).toBe("PROVISIONAL");
    expect(v.surfaceAsPattern).toBe(false);
    expect(v.reasons.join(" ")).toContain("needs 2");
  });

  it("withholds with plenty of evidence but low confidence", () => {
    const v = classifyInsightConfidence({ evidenceCount: 9, modelConfidence: 0.3 });
    expect(v.tier).toBe("PROVISIONAL");
    expect(v.surfaceAsPattern).toBe(false);
  });

  it("lets a user ACCURATE mark substitute for the confidence bar (but not the evidence bar)", () => {
    // 2 entries + user confirmation, model unsure → confirmable.
    const confirmed = classifyInsightConfidence({
      evidenceCount: 2,
      modelConfidence: 0.1,
      correctionState: "ACCURATE",
    });
    expect(confirmed.tier).toBe("CONFIRMED");

    // 1 entry + user confirmation → still not a pattern. Evidence bar holds.
    const provisional = classifyInsightConfidence({
      evidenceCount: 1,
      modelConfidence: 0.1,
      correctionState: "ACCURATE",
    });
    expect(provisional.tier).toBe("PROVISIONAL");
    expect(provisional.surfaceAsPattern).toBe(false);
  });

  it("INCOMPLETE does not block a confirmed pattern", () => {
    const v = classifyInsightConfidence({
      evidenceCount: 3,
      modelConfidence: 0.8,
      correctionState: "INCOMPLETE",
    });
    expect(v.tier).toBe("CONFIRMED");
  });
});

describe("input hardening", () => {
  it("floors and clamps a fractional evidence count", () => {
    expect(classifyInsightConfidence({ evidenceCount: 1.9, modelConfidence: 0.9 }).tier).toBe(
      "PROVISIONAL"
    );
  });

  it("treats a negative evidence count as zero", () => {
    const v = classifyInsightConfidence({ evidenceCount: -5, modelConfidence: 0.9 });
    expect(v.tier).toBe("UNSOURCED");
  });

  it("survives NaN / Infinity without granting a pattern", () => {
    expect(classifyInsightConfidence({ evidenceCount: NaN, modelConfidence: 0.9 }).surfaceAsPattern).toBe(false);
    const inf = classifyInsightConfidence({ evidenceCount: 3, modelConfidence: Infinity });
    expect(inf.effectiveConfidence).toBeLessThanOrEqual(1);
  });

  it("clamps an out-of-range model confidence", () => {
    expect(
      classifyInsightConfidence({ evidenceCount: 3, modelConfidence: 5 }).effectiveConfidence
    ).toBe(1);
    expect(
      classifyInsightConfidence({ evidenceCount: 3, modelConfidence: -2 }).effectiveConfidence
    ).toBe(0);
  });

  it("ignores an unrecognized correction value rather than trusting it", () => {
    const v = classifyInsightConfidence({
      evidenceCount: 3,
      modelConfidence: 0.9,
      correctionState: "TOTALLY_WRONG_LOL",
    });
    expect(v.tier).toBe("CONFIRMED"); // unknown value = no correction recorded
  });
});

describe("canSurfaceAsPattern mirrors the classifier", () => {
  it("agrees with tier === CONFIRMED across a matrix", () => {
    for (const evidenceCount of [0, 1, 2, 5]) {
      for (const modelConfidence of [null, 0, 0.5, 0.7, 1]) {
        for (const correctionState of [null, "ACCURATE", "INCOMPLETE", "WRONG"]) {
          const input = { evidenceCount, modelConfidence, correctionState };
          expect(canSurfaceAsPattern(input)).toBe(
            classifyInsightConfidence(input).tier === "CONFIRMED"
          );
        }
      }
    }
  });

  it("never returns true for zero evidence anywhere in that matrix", () => {
    for (const modelConfidence of [null, 0, 0.5, 0.7, 1]) {
      for (const correctionState of [null, "ACCURATE", "INCOMPLETE", "WRONG"]) {
        expect(
          canSurfaceAsPattern({ evidenceCount: 0, modelConfidence, correctionState })
        ).toBe(false);
      }
    }
  });
});

describe("flag + correction helpers", () => {
  it("EVIDENCE_RECEIPTS parsing is fail-closed", () => {
    for (const v of ["1", "true", "TRUE", " on ", "yes"]) {
      expect(parseEvidenceFlag(v)).toBe(true);
    }
    for (const v of ["0", "false", "", " ", "no", "ture", undefined, null]) {
      expect(parseEvidenceFlag(v as string | undefined)).toBe(false);
    }
  });

  it("normalizes correction states and rejects junk", () => {
    expect(normalizeCorrectionState("accurate")).toBe("ACCURATE");
    expect(normalizeCorrectionState("WRONG")).toBe("WRONG");
    expect(normalizeCorrectionState("Incomplete")).toBe("INCOMPLETE");
    expect(normalizeCorrectionState("maybe")).toBeNull();
    expect(normalizeCorrectionState(null)).toBeNull();
    expect(normalizeCorrectionState(42)).toBeNull();
  });
});
