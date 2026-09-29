/**
 * Which price tier a returning customer should be offered.
 *
 * Decision (Jim, 2026-09-29): anyone who was ever on a LEGACY plan
 * ($4.99 / $39.99) keeps legacy pricing when they come back to the paywall,
 * including a legacy monthly subscriber upgrading to annual ($39.99).
 * Everyone else is offered current (v2) pricing.
 *
 * "Was on a legacy plan" is read from what we actually know, not a signup
 * date: the stored App Store / Play product id, or the live Stripe price on
 * the customer's subscription. (A date cut would misclassify people who
 * started a trial before the 2026-09-20 price change but paid $9.99.)
 */

import { LEGACY_TIER } from "@acuity/shared";

export type CustomerPricingTier = "legacy" | "v2";

const LEGACY_STORE_PRODUCTS = new Set<string>([
  LEGACY_TIER.products.monthly.apple,
  LEGACY_TIER.products.annual.apple,
  LEGACY_TIER.products.monthly.google,
  LEGACY_TIER.products.annual.google,
]);

const LEGACY_STRIPE_PRICES = new Set<string>(
  [LEGACY_TIER.products.monthly.stripe, LEGACY_TIER.products.annual.stripe].filter(
    (p): p is string => typeof p === "string" && p.length > 0
  )
);

export interface PricingTierInput {
  appleProductId?: string | null;
  googleProductId?: string | null;
  /** Price id on the customer's Stripe subscription, when they have one. */
  stripePriceId?: string | null;
}

export function customerPricingTier(input: PricingTierInput): CustomerPricingTier {
  if (input.appleProductId && LEGACY_STORE_PRODUCTS.has(input.appleProductId)) return "legacy";
  if (input.googleProductId && LEGACY_STORE_PRODUCTS.has(input.googleProductId)) return "legacy";
  if (input.stripePriceId && LEGACY_STRIPE_PRICES.has(input.stripePriceId)) return "legacy";
  return "v2";
}
