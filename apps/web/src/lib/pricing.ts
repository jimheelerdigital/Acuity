/**
 * Single source of truth for plan prices used by the admin dashboard.
 * Marketing copy (landing pages, /for/*, terms, blog posts) intentionally
 * keeps inline prices for SEO/sales-copy precision and is NOT covered
 * by these constants — copy edits there go through docs/Acuity_SalesCopy.md.
 *
 * Stripe Price IDs live in env (STRIPE_PRICE_MONTHLY / STRIPE_PRICE_YEARLY)
 * and are not duplicated here. The cents values below mirror the prices
 * those Stripe Prices encode; if you change a price in Stripe, change
 * here too. Real Stripe-driven MRR (Slice 3) will read invoices and stop
 * relying on these constants for the headline number, but they remain
 * correct for per-row "this user pays $X" displays.
 */

export const MONTHLY_PRICE_CENTS = 1299;
export const ANNUAL_PRICE_CENTS = 9900;
export const ANNUAL_AS_MONTHLY_CENTS = Math.round(ANNUAL_PRICE_CENTS / 12);

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
