/**
 * Onboarding v10 — the compounding strip (Screen 5 bottom).
 *
 * ── This file exists to stop us lying about thresholds ───────────────
 *
 * The spec says sublines may state real thresholds "ONLY if the product
 * gates at them", and the appendix records what was verified against the
 * live database:
 *
 *   Patterns (UserInsight)  appear fast, ~2 entries median → safe to promise
 *   Life Matrix             EXISTS AT 0 ENTRIES (seeded from the dimension
 *                           preset) → NOT a threshold unlock. Presenting it
 *                           as "locked until N" would be a fabricated gate.
 *                           Its value is that it SHARPENS, not that it appears.
 *   Weekly report           real threshold, ~9+ entries (median 37) → set that
 *                           expectation; do NOT imply Day 7 for a light user
 *
 * The Life Matrix case is the subtle one and the reason this is a module
 * rather than three strings in a component: the obvious, symmetrical design
 * is three blurred cards each saying "unlocks at N", and for Life Matrix that
 * sentence would be false. `kind` forces the caller to render the honest
 * shape per card instead of assuming they're uniform.
 */

export type CompoundingKind =
  /** Genuinely gated on entry count. State a real number. */
  | "threshold"
  /** Present from the start; more debriefs sharpen it. Never say "unlocks". */
  | "sharpens";

export interface CompoundingCard {
  key: "patterns" | "life_matrix" | "weekly_report";
  title: string;
  kind: CompoundingKind;
  /**
   * Entries genuinely required before this surface says something useful.
   * Null for `sharpens` cards — a number here would imply a gate.
   */
  entriesNeeded: number | null;
  /** Subline. For `threshold`, states the real number. */
  subline: string;
}

/** Closing line under the strip. */
export const V10_COMPOUNDING_FOOTER =
  "Each time you return, Ripple connects what changes — and what keeps repeating.";

export const V10_COMPOUNDING_HEADING = "What Ripple can see from more";

/**
 * Verified 2026-08-19 against the production database. If these numbers are
 * ever re-measured, change them HERE — every surface reads from this array.
 */
export const V10_COMPOUNDING_CARDS: CompoundingCard[] = [
  {
    key: "patterns",
    title: "Patterns",
    kind: "threshold",
    entriesNeeded: 2,
    // ~2 entries median, so this is a promise we actually keep.
    subline: "Starts connecting after a couple of debriefs.",
  },
  {
    key: "life_matrix",
    title: "Life Matrix",
    kind: "sharpens",
    entriesNeeded: null,
    // NOT "unlocks at N" — it is already there on day one.
    subline: "Already here. Gets sharper the more you say.",
  },
  {
    key: "weekly_report",
    title: "Weekly report",
    kind: "threshold",
    entriesNeeded: 9,
    // Real threshold. Deliberately says "about nine" and not "Day 7":
    // a light user will not have nine debriefs in seven days, and promising
    // a day is the exact over-claim the spec forbids.
    subline: "Needs about nine debriefs before it's worth reading.",
  },
];

/**
 * Guard used by tests and by the render path: a `sharpens` card must never
 * carry an entry count, and a `threshold` card must always carry one. Catches
 * the "make it symmetrical" edit that would reintroduce a fake Life Matrix
 * gate.
 */
export function assertHonestCompounding(
  cards: CompoundingCard[] = V10_COMPOUNDING_CARDS
): void {
  for (const c of cards) {
    if (c.kind === "sharpens" && c.entriesNeeded !== null) {
      throw new Error(
        `${c.key}: a "sharpens" card must not claim an entry threshold — it is not gated`
      );
    }
    if (c.kind === "threshold" && (c.entriesNeeded === null || c.entriesNeeded < 1)) {
      throw new Error(
        `${c.key}: a "threshold" card must state the real entry count it gates at`
      );
    }
    if (/\bunlock/i.test(c.subline) && c.kind === "sharpens") {
      throw new Error(`${c.key}: "unlock" wording on a surface that is not gated`);
    }
  }
}
