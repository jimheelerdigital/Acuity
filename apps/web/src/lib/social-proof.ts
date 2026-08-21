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
  /** % who say they'd miss Ripple if gone */
  wouldMiss: "94%",
  /** App star rating */
  rating: "4.9",
  /** Under-hero count — rounded down from `users` for defensibility */
  underHeroCount: "100+",
  /** Seconds per entry — product mechanic, not a stat */
  secondsPerEntry: "60s",
} as const;

/** One item in the landing page's stats ticker. */
export type StatStripItem = {
  value: number;
  label: string;
  suffix?: string;
  prefix?: string;
};

/**
 * Stats strip items for the landing page ticker.
 *
 * Typed rather than `as const` on purpose: with `as const` each element got
 * its own literal type, so `prefix` existed on only the one entry that
 * happened to declare it and reading `stat.prefix` in a map was a type
 * error. Declaring the element type makes both optional fields readable on
 * every item.
 */
export const STATS_STRIP: readonly StatStripItem[] = [
  { value: 127, suffix: "+", label: "Early users" },
  { value: 1400, suffix: "+", label: "Debriefs recorded" },
  { value: 94, suffix: "%", label: "Still journaling after week one" },
  { value: 60, suffix: "s", label: "Per entry" },
];
