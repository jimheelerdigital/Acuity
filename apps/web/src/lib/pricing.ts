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
import {
  DEFAULT_PRICING_CONFIG,
  LEGACY_TIER,
  V2_TIER,
  pricingTierFor,
  type PricingTier,
} from "@acuity/shared";

export const MONTHLY_PRICE_CENTS = LEGACY_TIER.monthlyCents;
export const ANNUAL_PRICE_CENTS = LEGACY_TIER.annualCents;
export const ANNUAL_AS_MONTHLY_CENTS = Math.round(ANNUAL_PRICE_CENTS / 12);

// ── Display tier — what a PROSPECT would be charged ──────────────────
//
// Every user-facing price (paywall, marketing, landers, emails, blog
// prompts) must come from here, not a literal. The failure this prevents:
// `newPricingEnabled` flips, checkout starts charging the V2 price, and a
// page still advertises the old one. A page that quotes a different number
// than the card is charged is the worst outcome available in the whole
// pricing change — worse than any styling bug, and invisible to a
// typecheck.
//
// Resolves through pricingTierFor() with NO paidSince, i.e. "a new
// customer signing up right now". That is the correct question for a
// marketing surface: an anonymous visitor has no grandfathering to inherit.
// Surfaces speaking to an EXISTING subscriber must not use this — see
// legacyPriceDisplay() below.
//
// Behaviour today: newPricingEnabled is false, so pricingTierFor returns
// LEGACY_TIER and every display resolves $4.99 / $39.99, exactly as before.
// Wiring a surface to this function is behaviour-neutral until the flag
// moves, which is the whole point of doing it before the flip rather than
// during it.

/** Fail-closed, matching the RC flag convention in @acuity/shared. */
function newPricingEnabled(): boolean {
  const raw = process.env.NEW_PRICING_ENABLED ?? process.env.NEXT_PUBLIC_NEW_PRICING_ENABLED;
  if (typeof raw !== "string") return false;
  const v = raw.trim().toLowerCase();
  return v === "1" || v === "true" || v === "on" || v === "yes";
}

/** The tier a brand-new customer would be charged at this moment. */
export function displayTier(): PricingTier {
  return pricingTierFor(
    { paidSince: null, legacyUnknownStart: false },
    { ...DEFAULT_PRICING_CONFIG, newPricingEnabled: newPricingEnabled() }
  );
}

/** Prospect-facing monthly price, e.g. "$4.99". */
export function displayMonthly(): string {
  return formatDollars(displayTier().monthlyCents);
}

/** Prospect-facing annual price, e.g. "$39.99". */
export function displayAnnual(): string {
  return formatDollars(displayTier().annualCents);
}

/** Prospect-facing annual price expressed per month, e.g. "$3.33". */
export function displayAnnualAsMonthly(): string {
  return formatDollars(Math.round(displayTier().annualCents / 12));
}

/**
 * The LEGACY price, for copy that deliberately speaks about grandfathered
 * subscribers ("existing subscribers keep $4.99"). Named so that using it
 * is a visible decision rather than an accident.
 */
export function legacyPriceDisplay(): string {
  return formatDollars(LEGACY_TIER.monthlyCents);
}

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
  const tier = displayTier();
  return (yearly ? tier.annualCents : tier.monthlyCents) / 100;
}

// ── Analytics values follow the ACTIVE tier ──────────────────────────
//
// These feed Meta Pixel / CAPI `value` and `predicted_ltv`. They report
// what the purchaser is actually charged, so they must move with the tier —
// otherwise, post-cutover, every new subscriber is reported at the old
// price and Meta optimises ad delivery against revenue that never happened.
// That misspends budget silently: nothing errors, the numbers just drift.
//
// FUNCTIONS, not consts. A module-level const is evaluated once at import,
// which would capture the flag at whatever moment the module first loaded.
// Reading at call time keeps them consistent with displayMonthly() and
// makes them testable.
//
// Behaviour today: the flag is off, so both resolve LEGACY — 4.99 / 39.99,
// byte-identical to the previous constants.

/** Monthly price in dollars — the `predicted_ltv` / StartTrial value. */
export function monthlyPriceDollars(): number {
  return displayTier().monthlyCents / 100;
}

/** Annual price in dollars. */
export function annualPriceDollars(): number {
  return displayTier().annualCents / 100;
}

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
