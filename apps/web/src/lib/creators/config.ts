/**
 * Creator platform settings (2026-10-22, per Keenan — spec "Ripple UGC
 * Creator Platform — Spec"). Every number the referral / ledger / payout
 * code uses lives here; no other file hardcodes one. Money is integer cents.
 *
 * Decisions locked 2026-10-22:
 *   - 14-day hold (the spec's "30-day" mentions were stale)
 *   - milestone bonuses $50 / $150 / $300 at 10 / 25 / 50 paying customers
 *     per calendar month, each tier paid separately ($500 at 50)
 *   - Stripe Checkout payments come from our Stripe webhook; RevenueCat
 *     feeds App Store, Google Play and (since 2026-10-28) RC Web Billing.
 *     RC's STRIPE events are skipped so nothing is counted twice.
 */

/** 25% of net revenue. */
export const COMMISSION_RATE = 0.25;
/** Commission window from the customer's first paid payment. */
export const COMMISSION_WINDOW_MONTHS = 12;
/** Days after a payment before its commission becomes payable. */
export const HOLD_DAYS = 14;

/** Click cookie lifetime (Road 1). */
export const CLICK_COOKIE_DAYS = 90;
/** Captured-email match window (Road 3). */
export const EMAIL_MATCH_DAYS = 30;
/** Click rows are deleted after this many days. */
export const CLICK_RETENTION_DAYS = 90;

export const CLICK_COOKIE = "rp_click";
/** Share the click cookie with app.goripple.io signups; host-only elsewhere (previews, localhost). */
export function cookieDomainFor(host: string | null): string | undefined {
  const h = (host ?? "").split(":")[0].toLowerCase();
  return h === "goripple.io" || h.endsWith(".goripple.io") ? ".goripple.io" : undefined;
}
/** Readable by the landing banner: "<CODE>|<firstName>". */
export const CODE_COOKIE = "rp_creator";

export const BOOST_BONUS_CENTS = 100_00;
/** At most this many boost bonuses per calendar month across all creators. */
export const MAX_BOOSTS_PER_MONTH = 5;

/** Per calendar month; each tier paid separately once reached. */
export const MILESTONE_TIERS: Array<{ customers: number; bonusCents: number }> = [
  { customers: 10, bonusCents: 50_00 },
  { customers: 25, bonusCents: 150_00 },
  { customers: 50, bonusCents: 300_00 },
];

/** Payout runs: every other Friday starting here (UTC date). */
export const PAYOUT_ANCHOR_FRIDAY = "2026-11-06";
export const PAYOUT_MIN_CENTS = 25_00;
/**
 * Money only moves through Stripe Connect when this env flag is "1". Off
 * until Keenan finishes the Connect platform setup; runs can still be
 * previewed and PayPal / manual payouts recorded.
 */
export function stripePayoutsEnabled(): boolean {
  return process.env.CREATOR_STRIPE_PAYOUTS === "1";
}

/** Current creator agreement version — bump when the text changes. */
export const AGREEMENT_VERSION = "2026-10-22";

/** Referral code alphabet: no 0/O, 1/I/L. */
export const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const CODE_LENGTH = 6;

/**
 * Countries a creator can pick for their Stripe Express account. Ripple's
 * platform is US: US accounts use the full service agreement, every other
 * country needs the cross-border "recipient" agreement (transfers only).
 */
export const CONNECT_COUNTRIES: Array<{ code: string; name: string }> = [
  { code: "US", name: "United States" },
  { code: "CA", name: "Canada" },
  { code: "GB", name: "United Kingdom" },
  { code: "AU", name: "Australia" },
  { code: "NZ", name: "New Zealand" },
  { code: "IE", name: "Ireland" },
];

export function connectCountry(raw: string | null | undefined): string | null {
  const code = raw?.trim().toUpperCase();
  return CONNECT_COUNTRIES.some((c) => c.code === code) ? code! : null;
}

export const SITE_URL = "https://goripple.io";

export const CREATOR_EMAIL_FROM = '"Keenan from Ripple" <keenan@goripple.io>';
export const CREATOR_EMAIL_REPLY_TO = "keenan@heelerdigital.com";
/** Where payout-run previews and flag alerts go. */
export const ADMIN_ALERT_EMAIL = "keenan@heelerdigital.com";

/** FTC line every post must carry (dashboard post kit + brief + agreement). */
export const FTC_LINE =
  'Use "#ad" or the platform\'s paid-partnership label, plus: "I earn a commission from this link."';

// ── Fraud flag thresholds ────────────────────────────────────────────
export const FLAG_REFUND_RATE = 0.2;
export const FLAG_REFUND_MIN_PAYMENTS = 5;
export const FLAG_REFUND_WINDOW_DAYS = 90;
export const FLAG_VELOCITY_SIGNUPS_PER_DAY = 20;
export const FLAG_LOW_TRIAL_RATE = 0.1;
export const FLAG_LOW_TRIAL_MIN_SIGNUPS = 30;

/** Reconciliation tolerance per creator. */
export const RECONCILE_TOLERANCE_CENTS = 1_00;

/** Admin lists. */
export const BOOST_LIST_MAX_COST_PER_TRIAL_CENTS = 15_00;
export const DORMANT_DAYS = 30;
