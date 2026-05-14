/**
 * Canonical social proof numbers. Every public-facing surface imports
 * from here — no hardcoded stats anywhere else.
 *
 * Update this file as real numbers grow. The values below are intentionally
 * conservative for an early-access product.
 */
export const SOCIAL_PROOF = {
  /** Total active users (rounded) */
  users: "127+",
  /** Total debriefs recorded */
  debriefs: "1,400+",
  /** % who say they'd miss Acuity if gone */
  wouldMiss: "94%",
  /** App star rating — 4.8 reads more credible than 5.0 */
  rating: "4.8",
  /** Under-hero count — rounded down from `users` for defensibility */
  underHeroCount: "100+",
  /** Seconds per entry — product mechanic, not a stat */
  secondsPerEntry: "60s",
} as const;

/**
 * Stats strip items for the landing page ticker.
 * Each item is { value, suffix?, prefix?, label }.
 */
export const STATS_STRIP = [
  { value: 127, suffix: "+", label: "Early users" },
  { value: 1400, suffix: "+", label: "Debriefs recorded", prefix: "" },
  { value: 94, suffix: "%", label: "Say they'd miss it" },
  { value: 60, suffix: "s", label: "Per entry" },
] as const;
