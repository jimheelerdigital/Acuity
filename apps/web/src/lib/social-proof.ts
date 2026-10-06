/**
 * Canonical social proof numbers. Every public-facing surface imports
 * from here — no hardcoded stats anywhere else.
 *
 * Update this file as real numbers grow. The values below are intentionally
 * conservative for an early-access product.
 */
/**
 * THE rating and review count (2026-10-06, per Keenan: one config value,
 * used everywhere; nothing else hardcodes "4.9" or "127"). Numbers are
 * unchanged pending Keenan confirming the live App Store figures.
 */
export const APP_RATING = {
  /** Star rating shown next to the stars. */
  stars: "4.9",
  /** Users/reviews count behind it; shown as "127+". */
  count: 127,
} as const;

export const SOCIAL_PROOF = {
  /** Total active users (rounded) */
  users: `${APP_RATING.count}+`,
  /** Total debriefs recorded */
  debriefs: "1,400+",
  /** % who say they'd miss Ripple if gone */
  wouldMiss: "94%",
  /** App star rating */
  rating: APP_RATING.stars,
  /** Under-hero count — rounded down from `users` for defensibility */
  underHeroCount: "100+",
  /** Seconds per entry — product mechanic, not a stat */
  secondsPerEntry: "60s",
} as const;

/**
 * The rating line shown in the ad funnels and signup flows (Keenan's call,
 * 2026-09-24): five stars "on the App Store", no number and no user count.
 * The old "4.9 from 127+ users" line didn't match the App Store, which shows
 * a 5.0 average from a handful of ratings.
 */
export const APP_STORE_RATING_LABEL = "on the App Store";

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
  { value: APP_RATING.count, suffix: "+", label: "Early users" },
  { value: 1400, suffix: "+", label: "Debriefs recorded" },
  { value: 94, suffix: "%", label: "Still journaling after week one" },
  { value: 60, suffix: "s", label: "Per entry" },
];
