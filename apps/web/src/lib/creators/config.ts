/**
 * Creator platform settings (2026-10-22, per Keenan — spec "Ripple UGC
 * Creator Platform — Spec"). Every number the referral / ledger / payout
 * code uses lives here; no other file hardcodes one. Money is integer cents.
 *
 * Decisions locked 2026-10-22:
 *   - 14-day hold (the spec's "30-day" mentions were stale)
 *   - milestone bonuses $50 / $150 / $300 at 10 / 25 / 50 paying customers
 *     per calendar month, each tier paid separately ($500 at 50). Removed
 *     2026-10-31, restored 2026-11-02 (Keenan's current program terms).
 *   - web payments come from our Stripe webhook; RevenueCat feeds App Store
 *     and Google Play only (its Stripe / RC Billing events are skipped so
 *     nothing is counted twice)
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

/**
 * Ad-selection bonus: earned when we pick the video for ads, whether or not
 * the ad launches. No monthly cap (2026-11-02): a cap would leave a picked
 * video unpaid, which the terms don't allow.
 */
export const BOOST_BONUS_CENTS = 100_00;

/** Per calendar month; each tier paid separately once reached. */
export const MILESTONE_TIERS: Array<{ customers: number; bonusCents: number }> = [
  { customers: 10, bonusCents: 50_00 },
  { customers: 25, bonusCents: 150_00 },
  { customers: 50, bonusCents: 300_00 },
];

/**
 * View bonuses (2026-11-02, Keenan's current terms): per video, organic
 * views measured on day VIEW_BONUS_WINDOW_DAYS after posting (verified with
 * an Insights screenshot when the public count falls short). The highest
 * tier reached is the video's total (25k views = $200, not $25 + $100 +
 * $200); a later tier pays the difference. The daily scan locks the public
 * count and awards on day 14; an admin can top up from the creator page
 * after checking a screenshot. (Was 5k / 25k / 50k, 10-31.)
 */
export const VIEW_BONUS_WINDOW_DAYS = 14;
export const VIEW_BONUS_TIERS: Array<{ views: number; bonusCents: number }> = [
  { views: 1_000, bonusCents: 25_00 },
  { views: 10_000, bonusCents: 100_00 },
  { views: 25_000, bonusCents: 200_00 },
];

/**
 * Free Ripple Pro for creators (2026-11-02 terms): free for the first
 * CREATOR_PRO_FREE_MONTHS with no signups needed; after that it stays free
 * in any month the creator refers at least CREATOR_PRO_MIN_PAID_PER_MONTH
 * paying customer. Communicated only: Pro is not switched off by code yet.
 */
export const CREATOR_PRO_FREE_MONTHS = 2;
export const CREATOR_PRO_MIN_PAID_PER_MONTH = 1;

/**
 * Creator post tracking (2026-10-31): Ripple's own accounts. A creator post
 * that tags / mentions / collabs with one of these (or uses #ripple) is added
 * to their dashboard by the daily scan. Lowercase, no "@".
 */
export const RIPPLE_SOCIAL = { instagram: "ripplevoice", tiktok: "getripple" } as const;
export const RIPPLE_SOCIAL_HANDLES: string[] = Object.values(RIPPLE_SOCIAL);
/** How far back the daily scan looks on a creator's profile. */
export const SCAN_LOOKBACK_DAYS = VIEW_BONUS_WINDOW_DAYS + 2;

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
export const AGREEMENT_VERSION = "2026-11-02";

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
