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

/**
 * Could this row be a RevenueCat Web Billing subscriber? (RC_BILLING writes
 * subscriptionSource "stripe".) Gates the RevenueCat lookup in the manage /
 * portal routes; the lookup itself decides (it only answers for a live
 * RC_BILLING subscription).
 *
 * A row WITH a Stripe customer is only looked up while web checkout runs on
 * RevenueCat (`webBillingOn`) — that's when a returning Stripe customer can
 * have re-subscribed through RevenueCat. With it off, Stripe customers go
 * straight to the Stripe portal exactly as before (no extra RC call). PURE.
 */
export function mayHaveRcWebBilling(
  user: {
    stripeCustomerId: string | null | undefined;
    subscriptionSource: string | null | undefined;
    subscriptionStatus: string | null | undefined;
  },
  webBillingOn: boolean = isRcWebBillingOnServer()
): boolean {
  if (user.subscriptionSource !== "stripe") return false;
  if (!LIVE_STATUSES.has(user.subscriptionStatus ?? "")) return false;
  return webBillingOn || !user.stripeCustomerId;
}

/** Server read of the same switch the browser checkout uses. */
export function isRcWebBillingOnServer(): boolean {
  return (
    process.env.NEXT_PUBLIC_RC_WEB_BILLING === "1" &&
    !!process.env.NEXT_PUBLIC_RC_WEB_BILLING_KEY
  );
}
