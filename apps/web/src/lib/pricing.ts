/**
 * Single source of truth for displayed pricing across the web
 * /upgrade page, the marketing landing pricing section, persona
 * landers, trial-lifecycle email templates, and the onboarding-v2
 * paywall (slice 9). Mobile inherits via SFSafari handoff to
 * /upgrade — never duplicate price strings in apps/mobile.
 *
 * Stripe Price IDs live in env (STRIPE_PRICE_MONTHLY /
 * STRIPE_PRICE_YEARLY) so per-env testing + rollback don't require
 * a code change. The `stripeId` fields below are the fallback
 * defaults for local dev when env is missing; the production checkout
 * route always reads `process.env` directly.
 *
 * Pricing change 2026-05-25: $12.99 / $99 → $4.99 / $39.99. Old
 * Price IDs preserved in the comments below for rollback documentation
 * (Stripe-side they remain active — pointing back is a one-env-var
 * change).
 */

// ── Active prices ───────────────────────────────────────────────────
export const MONTHLY_PRICE_CENTS = 499;
export const ANNUAL_PRICE_CENTS = 19900;
export const ANNUAL_AS_MONTHLY_CENTS = Math.round(ANNUAL_PRICE_CENTS / 12);

// ── Rollback reference ──────────────────────────────────────────────
// Old monthly $12.99: price_1TPqUqD9XJakJqj54TZyFYXZ
// Old annual  $99   : price_1TPqVGD9XJakJqj5spcrLTmE
// Old MONTHLY_PRICE_CENTS = 1299
// Old ANNUAL_PRICE_CENTS  = 9900
// Rollback steps (no code change required for prices):
//   1. Set STRIPE_PRICE_MONTHLY back to the $12.99 Price ID in
//      Vercel + .env.local
//   2. Set STRIPE_PRICE_YEARLY back to the $99 Price ID
//   3. Revert this file or update the constants/PRICING block

/**
 * Source-of-truth shape consumed by /upgrade and the slice 9
 * onboarding paywall (PARENT 12098990473). Both surfaces import
 * `PRICING` instead of hardcoding prices so a future change is a
 * single-file edit + one Stripe Price ID swap.
 *
 * `savingsVsMonthly` is computed at module load so any future price
 * change recomputes the badge string correctly. Math:
 *   monthly × 12       = $4.99 × 12 = $59.88
 *   annual             = $39.99
 *   savings            = $19.89
 *   pct vs monthly run = 19.89 / 59.88 ≈ 33%
 */
const monthlyRunRate = MONTHLY_PRICE_CENTS * 12;
const annualSavingsCents = monthlyRunRate - ANNUAL_PRICE_CENTS;
const annualSavingsPct =
  monthlyRunRate > 0
    ? Math.round((annualSavingsCents / monthlyRunRate) * 100)
    : 0;

export const PRICING = {
  monthly: {
    price: MONTHLY_PRICE_CENTS / 100,
    cents: MONTHLY_PRICE_CENTS,
    stripeId:
      process.env.STRIPE_PRICE_MONTHLY ?? "price_1Tb335D9XJakJqj5nwTjb4cf",
  },
  annual: {
    price: ANNUAL_PRICE_CENTS / 100,
    cents: ANNUAL_PRICE_CENTS,
    stripeId:
      process.env.STRIPE_PRICE_YEARLY ?? "price_1TcSPvD9XJakJqj5C2dITYrR",
    savingsVsMonthly: `${annualSavingsPct}%`,
    savingsCents: annualSavingsCents,
  },
} as const;

export function formatDollars(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export function formatDollarsRounded(cents: number): string {
  return `$${(cents / 100).toFixed(0)}`;
}

/**
 * Subscription status strings as written by the Stripe webhook
 * (apps/web/src/app/api/stripe/webhook/route.ts). The Stripe webhook
 * normalizes Stripe's granular vocab onto these four values; everywhere
 * else in the app reads `User.subscriptionStatus` and should compare
 * against these constants — never against ad-hoc strings like "ACTIVE"
 * or "CANCELED" which the webhook does NOT write.
 */
export const SUBSCRIPTION_STATUS = {
  TRIAL: "TRIAL",
  PRO: "PRO",
  PAST_DUE: "PAST_DUE",
  FREE: "FREE",
} as const;

export type SubscriptionStatus =
  (typeof SUBSCRIPTION_STATUS)[keyof typeof SUBSCRIPTION_STATUS];
