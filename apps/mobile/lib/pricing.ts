/**
 * Mobile-side mirror of apps/web/src/lib/pricing.ts displayed-price
 * constants. Slice 12 (2026-05-26) onboarding-v2 paywall.
 *
 * Why a duplicate rather than a runtime import: apps/web's lib lives
 * outside the mobile bundle. Promoting these constants to packages/
 * shared would be the long-term right move (no drift possible) but
 * it expands slice 12's scope. Documented coupling now; slice 14 or
 * a follow-up can promote.
 *
 * Web is canonical. Any price change there MUST be mirrored here.
 * The cents constants below MUST equal apps/web/src/lib/pricing.ts
 * MONTHLY_PRICE_CENTS / ANNUAL_PRICE_CENTS verbatim.
 *
 * Stripe Price IDs intentionally NOT mirrored — mobile never calls
 * Stripe directly. The paywall hands off to web's /upgrade via
 * SFSafariView, where the canonical Price IDs are env-var-driven.
 */

export const MONTHLY_PRICE_CENTS = 499;
export const ANNUAL_PRICE_CENTS = 3999;
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
