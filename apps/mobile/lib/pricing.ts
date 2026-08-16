/**
 * Mobile-side displayed-price constants.
 *
 * 2026-08-15: the promotion this file's original header asked for is done.
 * These values are no longer a hand-mirrored copy of
 * apps/web/src/lib/pricing.ts — both now derive from ONE definition in
 * packages/shared/src/pricing-plans.ts (LEGACY_TIER), so web/mobile price
 * drift is structurally impossible rather than prevented by a comment.
 *
 * Values are UNCHANGED ($4.99 / $39.99). Raising prices is a config change
 * (newPricingEnabled + grandfathering), not an edit here.
 *
 * Stripe Price IDs intentionally NOT mirrored — mobile never calls
 * Stripe directly. The paywall hands off to web's /upgrade via
 * SFSafariView, where the canonical Price IDs are env-var-driven.
 */

import { LEGACY_TIER } from "@acuity/shared";

export const MONTHLY_PRICE_CENTS = LEGACY_TIER.monthlyCents;
export const ANNUAL_PRICE_CENTS = LEGACY_TIER.annualCents;
export const ANNUAL_AS_MONTHLY_CENTS = Math.round(ANNUAL_PRICE_CENTS / 12);

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
  },
  annual: {
    price: ANNUAL_PRICE_CENTS / 100,
    cents: ANNUAL_PRICE_CENTS,
    savingsVsMonthly: `${annualSavingsPct}%`,
    savingsCents: annualSavingsCents,
  },
} as const;

export function formatDollars(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}
