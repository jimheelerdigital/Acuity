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
//
// Derived from the shared catalog (packages/shared/src/pricing-plans.ts)
// rather than written twice. LEGACY_TIER is the live tier, so these values
// are UNCHANGED — $4.99 / $39.99 — but there is now exactly one definition,
// shared with mobile, instead of two constants that had to be kept in sync
// by comment ("Web is canonical. Any price change there MUST be mirrored
// here"). Raising prices later is a config change (newPricingEnabled), not
// an edit to every surface. See docs/REVENUECAT_MIGRATION.md.
import { LEGACY_TIER, V2_TIER } from "@acuity/shared";

export const MONTHLY_PRICE_CENTS = LEGACY_TIER.monthlyCents;
export const ANNUAL_PRICE_CENTS = LEGACY_TIER.annualCents;
export const ANNUAL_AS_MONTHLY_CENTS = Math.round(ANNUAL_PRICE_CENTS / 12);

/**
 * The not-yet-active V2 tier, re-exported so surfaces that need to *quote*
 * the future price (internal previews, migration comms drafts) can do so
 * without importing from the shared package directly. Nothing user-facing
 * should read this until the pricing decision ships.
 */
export const V2_MONTHLY_PRICE_CENTS = V2_TIER.monthlyCents;
export const V2_ANNUAL_PRICE_CENTS = V2_TIER.annualCents;

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
    // Env wins; the catalog supplies the local-dev / documentation fallback.
    stripeId:
      process.env.STRIPE_PRICE_MONTHLY ??
      LEGACY_TIER.products.monthly.stripe ??
      "",
  },
  annual: {
    price: ANNUAL_PRICE_CENTS / 100,
    cents: ANNUAL_PRICE_CENTS,
    stripeId:
      process.env.STRIPE_PRICE_YEARLY ??
      LEGACY_TIER.products.annual.stripe ??
      "",
    savingsVsMonthly: `${annualSavingsPct}%`,
    savingsCents: annualSavingsCents,
  },
} as const;

/**
 * Analytics/CAPI value for a plan, in dollars.
 *
 * Exists so pixel + Conversions API call sites stop hardcoding
 * `interval === "yearly" ? 39.99 : 4.99`. Those literals were duplicated
 * across seven call sites; each one is a place where a price change silently
 * starts reporting the wrong revenue to Meta, which then optimizes ad
 * delivery against bad numbers.
 */
export function planValueDollars(
  interval: string | null | undefined
): number {
  const yearly = interval === "yearly" || interval === "annual" || interval === "year";
  return (yearly ? ANNUAL_PRICE_CENTS : MONTHLY_PRICE_CENTS) / 100;
}

/** Monthly price in dollars — the `predicted_ltv` / StartTrial value. */
export const MONTHLY_PRICE_DOLLARS = MONTHLY_PRICE_CENTS / 100;
/** Annual price in dollars. */
export const ANNUAL_PRICE_DOLLARS = ANNUAL_PRICE_CENTS / 100;

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
