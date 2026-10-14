/**
 * RevenueCat Web Billing — server side.
 *
 * goripple.io sells through RevenueCat Web Billing (purchases-js in the
 * browser) instead of Stripe Checkout directly, so web purchases live in the
 * same RevenueCat project as the App Store and Play ones: one entitlement
 * (`pro`), one customer per `User.id`, and the funnel can be changed from
 * the RevenueCat dashboard without a deploy.
 *
 * Existing Stripe-direct subscribers are untouched — they keep billing in
 * Stripe and RevenueCat already tracks them through its Stripe app.
 *
 * Which offering a checkout uses (all configured in the RC dashboard,
 * 2026-10-14):
 *   - funnel  → `default`            (web products carry the 7-day trial;
 *                                     eligibility "has never made any purchase")
 *   - upgrade → `web_upgrade`        ($9.99 / $89.99, no trial — charge now)
 *             → `web_upgrade_legacy` ($4.99 / $39.99, no trial) for anyone
 *               who was ever on legacy pricing (lib/pricing-tier.ts rule).
 */

import { LEGACY_TIER } from "@acuity/shared";

import { customerPricingTier, type CustomerPricingTier } from "@/lib/pricing-tier";
import { fetchRcSubscriber, type RcSubscriber } from "@/lib/revenuecat/client";
import { safeLog } from "@/lib/safe-log";

export type WebCheckoutSurface = "funnel" | "upgrade";

export const WEB_OFFERINGS = {
  funnel: "default",
  upgrade: "web_upgrade",
  upgradeLegacy: "web_upgrade_legacy",
} as const;

/** RC Web Billing product ids that mean "this customer is on legacy pricing". */
export const LEGACY_WEB_PRODUCTS = new Set<string>([
  "ripple_pro_monthly_web_legacy",
  "ripple_pro_annual_web_legacy",
  "ripple_pro_monthly_web_legacy_now",
  "ripple_pro_annual_web_legacy_now",
]);

const LEGACY_ANY_STORE = new Set<string>(
  [
    LEGACY_TIER.products.monthly.apple,
    LEGACY_TIER.products.annual.apple,
    LEGACY_TIER.products.monthly.google,
    LEGACY_TIER.products.annual.google,
    LEGACY_TIER.products.monthly.stripe,
    LEGACY_TIER.products.annual.stripe,
  ].filter((p): p is string => typeof p === "string" && p.length > 0)
);

/**
 * True when RevenueCat has EVER seen this customer on a legacy product, in
 * any store. RC keys `subscriptions` by product id (Play ids can carry a
 * ":base-plan" suffix), so the keys are the purchase history.
 */
export function rcHistoryIsLegacy(subscriber: RcSubscriber | null): boolean {
  if (!subscriber?.subscriptions) return false;
  for (const productId of Object.keys(subscriber.subscriptions)) {
    const base = productId.split(":")[0];
    if (LEGACY_WEB_PRODUCTS.has(productId) || LEGACY_ANY_STORE.has(base)) return true;
  }
  return false;
}

export interface WebCheckoutConfig {
  appUserId: string;
  email: string | null;
  offeringId: string;
  tier: CustomerPricingTier;
}

/**
 * Everything the browser needs to open RevenueCat checkout for this user.
 * The tier decision stays on the server so a client can't pick legacy.
 */
export async function resolveWebCheckout(
  userId: string,
  surface: WebCheckoutSurface
): Promise<WebCheckoutConfig | null> {
  const { prisma } = await import("@/lib/prisma");
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      email: true,
      appleProductId: true,
      googleProductId: true,
      stripeSubscriptionId: true,
    },
  });
  if (!user) return null;

  if (surface === "funnel") {
    // The funnel is for new customers; current pricing with the trial.
    return { appUserId: userId, email: user.email, offeringId: WEB_OFFERINGS.funnel, tier: "v2" };
  }

  let stripePriceId: string | null = null;
  if (user.stripeSubscriptionId) {
    try {
      const { stripe } = await import("@/lib/stripe");
      const sub = await stripe.subscriptions.retrieve(user.stripeSubscriptionId);
      stripePriceId = sub.items.data[0]?.price?.id ?? null;
    } catch (err) {
      safeLog.warn("rc-web-billing.stripe-lookup-failed", {
        userId,
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }

  let tier = customerPricingTier({
    appleProductId: user.appleProductId,
    googleProductId: user.googleProductId,
    stripePriceId,
  });
  if (tier !== "legacy") {
    const rc = await fetchRcSubscriber(userId);
    if (rc.ok && rcHistoryIsLegacy(rc.subscriber)) tier = "legacy";
  }

  return {
    appUserId: userId,
    email: user.email,
    offeringId: tier === "legacy" ? WEB_OFFERINGS.upgradeLegacy : WEB_OFFERINGS.upgrade,
    tier,
  };
}
