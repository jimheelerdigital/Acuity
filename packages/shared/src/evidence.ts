/**
 * Evidence-backed insights — the "show your receipts" core rule.
 *
 * THE RULE, stated once:
 *
 *   An insight with no traceable source entries is low-confidence and must
 *   NEVER be surfaced as a confirmed pattern. No exceptions, no overrides —
 *   not by a high model-reported confidence, not by the user themselves
 *   marking it accurate.
 *
 * Why it is absolute rather than a weighted factor: the product promise is
 * *evidential*, not merely truthful. "Ripple noticed X, here's where you
 * said it" is a claim we can only make when we can produce the quote. A
 * confident-sounding model with nothing behind it is precisely the failure
 * this feature exists to prevent — an LLM asked to "surface whatever pattern
 * reads as meaningful" (which is literally what today's generator does when
 * its heuristic scanner finds nothing — see
 * inngest/functions/compute-user-insights.ts:452) will happily produce
 * fluent, plausible, unfalsifiable patterns. Weighting would let a
 * sufficiently confident fabrication through. A gate cannot.
 *
 * Lives in @acuity/shared so the API, the generator, and any future mobile
 * or web renderer all classify identically. A receipt shown on one surface
 * and withheld on another would be worse than either.
 */

// ─── Flag ────────────────────────────────────────────────────────────

export const EVIDENCE_RECEIPTS_FLAG = "EVIDENCE_RECEIPTS";

/**
 * Strict, fail-closed env parsing. Only "1" / "true" / "on" / "yes"
 * (case-insensitive, trimmed) enable. Anything else — "0", "false", "",
 * undefined, a typo — is OFF.
 *
 * Same semantics as the RC migration's `parseRcFlag`, deliberately restated
 * rather than imported so this module has no dependency on billing code.
 */
export function parseEvidenceFlag(raw: string | undefined | null): boolean {
  if (typeof raw !== "string") return false;
  const v = raw.trim().toLowerCase();
  return v === "1" || v === "true" || v === "on" || v === "yes";
}

// ─── Correction state ────────────────────────────────────────────────

export const CORRECTION_STATES = ["ACCURATE", "INCOMPLETE", "WRONG"] as const;
export type CorrectionState = (typeof CORRECTION_STATES)[number];

export function isCorrectionState(v: unknown): v is CorrectionState {
  return (
    typeof v === "string" &&
    (CORRECTION_STATES as readonly string[]).includes(v.toUpperCase())
  );
}

export function normalizeCorrectionState(v: unknown): CorrectionState | null {
  if (!isCorrectionState(v)) return null;
  return (v as string).toUpperCase() as CorrectionState;
}

// ─── Confidence tiers ────────────────────────────────────────────────

export type ConfidenceTier =
  /** ≥2 independent source entries and the model was confident. Citable. */
  | "CONFIRMED"
  /** At least one source entry, but not enough to call it a pattern. */
  | "PROVISIONAL"
  /** No traceable source entries. Never citable, never a "pattern". */
  | "UNSOURCED"
  /** The user told us this is wrong. Outranks everything below it. */
  | "REFUTED";

export interface InsightConfidenceInput {
  /** How many DISTINCT source entries back this insight. */
  evidenceCount: number;
  /** Model-reported confidence 0..1, or null when not reported. */
  modelConfidence?: number | null;
  /** User correction, if any. */
  correctionState?: string | null;
}

export interface ConfidenceVerdict {
  tier: ConfidenceTier;
  /**
   * The ONLY thing callers should gate "is this a pattern?" on.
   * True exclusively for CONFIRMED.
   */
  surfaceAsPattern: boolean;
  /**
   * Confidence after the evidence gate is applied. Never exceeds what the
   * evidence supports, regardless of what the model claimed.
   */
  effectiveConfidence: number;
  /** Human-readable why, for debugging and for the ledger's uncertainty list. */
  reasons: string[];
}

/** ≥ this many distinct source entries is required to call something a pattern. */
export const CONFIRMED_MIN_EVIDENCE = 2;
/** Model confidence required alongside that evidence. */
export const CONFIRMED_MIN_CONFIDENCE = 0.7;
/**
 * Hard ceiling applied to an unsourced insight's confidence, no matter what
 * the model reported. Keeps a fabricated-but-confident claim from ever
 * out-ranking a modestly-confident evidenced one in any sort order.
 */
export const UNSOURCED_CONFIDENCE_CEILING = 0.2;

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

/**
 * Classify one insight. Pure — no I/O, no clock, fully unit-testable.
 *
 * Precedence (first match wins):
 *   1. user said WRONG        → REFUTED,     never surfaced
 *   2. zero evidence          → UNSOURCED,   never surfaced  ← THE RULE
 *   3. enough evidence + conf → CONFIRMED,   surfaced
 *   4. otherwise              → PROVISIONAL, not surfaced as a pattern
 *
 * Note ordering of 1 and 2: a user marking something WRONG is reported as
 * REFUTED even when it has evidence, because "we found quotes" does not
 * override "the person it's about says it's incorrect."
 */
export function classifyInsightConfidence(
  input: InsightConfidenceInput
): ConfidenceVerdict {
  const evidenceCount = Number.isFinite(input.evidenceCount)
    ? Math.max(0, Math.floor(input.evidenceCount))
    : 0;
  const reported =
    typeof input.modelConfidence === "number"
      ? clamp01(input.modelConfidence)
      : null;
  const correction = normalizeCorrectionState(input.correctionState);
  const reasons: string[] = [];

  // 1. User refutation outranks everything.
  if (correction === "WRONG") {
    return {
      tier: "REFUTED",
      surfaceAsPattern: false,
      effectiveConfidence: 0,
      reasons: ["user marked this insight WRONG"],
    };
  }

  // 2. THE RULE. Absolute — checked before any confidence maths, so there is
  //    no arithmetic path that can promote an unsourced insight.
  if (evidenceCount === 0) {
    const ceiling =
      reported === null
        ? 0
        : Math.min(reported, UNSOURCED_CONFIDENCE_CEILING);
    reasons.push("no traceable source entries — cannot be shown as a pattern");
    if (reported !== null && reported > UNSOURCED_CONFIDENCE_CEILING) {
      // Worth logging loudly: the model was confident about something it
      // could not point at. That is the fabrication signature.
      reasons.push(
        `model reported ${reported.toFixed(2)} confidence but cited nothing; capped to ${UNSOURCED_CONFIDENCE_CEILING}`
      );
    }
    if (correction === "ACCURATE") {
      reasons.push(
        "user marked ACCURATE, but with no citable entries we still cannot show receipts"
      );
    }
    return {
      tier: "UNSOURCED",
      surfaceAsPattern: false,
      effectiveConfidence: ceiling,
      reasons,
    };
  }

  // From here the insight has at least one real source entry.
  // A user confirmation is stronger evidence than the model's own estimate,
  // so it substitutes for the confidence bar (but never for the evidence bar).
  const userConfirmed = correction === "ACCURATE";
  const effective = userConfirmed ? Math.max(reported ?? 0, 0.9) : (reported ?? 0);

  if (userConfirmed) reasons.push("user marked ACCURATE");
  if (reported === null && !userConfirmed) {
    reasons.push("model did not report a confidence; treated as 0");
  }

  // 3. Confirmed pattern.
  if (
    evidenceCount >= CONFIRMED_MIN_EVIDENCE &&
    effective >= CONFIRMED_MIN_CONFIDENCE
  ) {
    reasons.push(
      `${evidenceCount} source entries at ${effective.toFixed(2)} confidence`
    );
    return {
      tier: "CONFIRMED",
      surfaceAsPattern: true,
      effectiveConfidence: effective,
      reasons,
    };
  }

  // 4. Provisional — real but not yet a pattern.
  if (evidenceCount < CONFIRMED_MIN_EVIDENCE) {
    reasons.push(
      `only ${evidenceCount} source entry — needs ${CONFIRMED_MIN_EVIDENCE} to be called a pattern`
    );
  }
  if (effective < CONFIRMED_MIN_CONFIDENCE) {
    reasons.push(
      `confidence ${effective.toFixed(2)} below the ${CONFIRMED_MIN_CONFIDENCE} bar`
    );
  }
  return {
    tier: "PROVISIONAL",
    surfaceAsPattern: false,
    effectiveConfidence: effective,
    reasons,
  };
}

/**
 * Convenience predicate for read paths: may this insight be presented to the
 * user as a pattern Ripple has observed?
 *
 * Read paths should call THIS rather than re-deriving the rule, so there is
 * exactly one place the gate can be got wrong.
 */
export function canSurfaceAsPattern(input: InsightConfidenceInput): boolean {
  return classifyInsightConfidence(input).surfaceAsPattern;
}
