/**
 * Can this user open "Manage subscription" (POST /api/stripe/portal)?
 *
 * Historically that meant "has a Stripe customer". RevenueCat Web Billing
 * subscribers are web subscribers too (RC maps the RC_BILLING store to our
 * "stripe" subscriptionSource) but have NO stripeCustomerId on their row —
 * RC owns the billing relationship. For them the portal route hands back
 * RevenueCat's customer-portal link instead of a Stripe portal session.
 *
 * Checked against production on 2026-10-14: every stripe-sourced
 * PRO/TRIAL row has a stripeCustomerId, so a live stripe-sourced row
 * WITHOUT one is a Web Billing subscriber, not a broken Stripe row.
 *
 * Pure — shared by /api/user/me (mobile) and the /account page (web), so
 * existing mobile builds pick this up with no app release.
 */
const LIVE_STATUSES = new Set(["PRO", "TRIAL", "PAST_DUE"]);

export function canManageWebSubscription(user: {
  stripeCustomerId: string | null | undefined;
  subscriptionSource: string | null | undefined;
  subscriptionStatus: string | null | undefined;
}): boolean {
  if (user.stripeCustomerId) return true;
  return (
    user.subscriptionSource === "stripe" &&
    LIVE_STATUSES.has(user.subscriptionStatus ?? "")
  );
}
