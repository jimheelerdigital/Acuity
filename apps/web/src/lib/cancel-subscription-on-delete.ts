import type Stripe from "stripe";

/**
 * Best-effort subscription cancellation at account-deletion time.
 *
 * Incident 2026-06-13 (orphan subscriptions after deletion): account deletion
 * never reliably canceled the active subscription. The old paths only called
 * `stripe.customers.del()` gated on `user.stripeCustomerId` — but users who
 * checked out during the Stripe-webhook outage never had `stripeCustomerId`
 * (or `stripeSubscriptionId`) written to their row, so the block was skipped
 * and their trial converted + billed AFTER deletion.
 *
 * Resolution order (each step is a fallback for missing local data):
 *   1. `stripeSubscriptionId` present → cancel it directly.
 *   2. else `stripeCustomerId` present → cancel every live sub on that customer.
 *   3. else → look the customer up by email and cancel every live sub.
 * Step 3 is what closes the webhook-outage leak (null local IDs).
 *
 * Apple / Google Play subscriptions are store-owned and CANNOT be canceled
 * server-side — the delete-account UI warns the user to cancel in iOS / Play
 * settings. We return "not_applicable" for those.
 *
 * RevenueCat Web Billing (2026-10-14): those subscribers are stripe-sourced
 * but have NO local Stripe ids — RevenueCat bills them, not Stripe
 * Subscriptions. When the row has that shape and the caller passes
 * `rcCancel`, we also cancel through RevenueCat. (Production check on
 * 2026-10-14: every live stripe-sourced row has a stripeCustomerId, so this
 * shape does not catch existing Stripe subscribers.)
 *
 * NEVER throws: the user's right to delete trumps our ability to cancel
 * cleanly. All Stripe errors are caught and surfaced as "failed" so the
 * caller can record an audit trail and proceed with the purge.
 */

export type CancellationStatus = "success" | "failed" | "not_applicable";

export type DeletionUser = {
  /** App user id — RevenueCat's customer id. Needed for the RC path. */
  id?: string;
  email: string;
  subscriptionStatus: string;
  subscriptionSource: string | null;
  stripeSubscriptionId: string | null;
  stripeCustomerId: string | null;
};

// Ripple subscriptionStatus values that imply a live/convertible plan.
const BILLABLE_STATUS = new Set(["TRIAL", "PRO", "PAST_DUE"]);
// Stripe subscription.status values that are still live (would bill).
const LIVE_SUB_STATUS = new Set(["trialing", "active", "past_due", "unpaid"]);

export type RcCancelFn = (appUserId: string) => Promise<CancellationStatus>;

/** Live stripe-sourced row with no local Stripe ids = RevenueCat Web Billing. */
export function looksLikeRcWebBilling(user: DeletionUser): boolean {
  return (
    BILLABLE_STATUS.has(user.subscriptionStatus) &&
    user.subscriptionSource === "stripe" &&
    !user.stripeSubscriptionId &&
    !user.stripeCustomerId
  );
}

export async function cancelSubscriptionOnDelete(
  stripe: Stripe,
  user: DeletionUser,
  opts: { rcCancel?: RcCancelFn } = {}
): Promise<CancellationStatus> {
  // No live plan → nothing to cancel.
  if (!BILLABLE_STATUS.has(user.subscriptionStatus)) return "not_applicable";

  // RevenueCat Web Billing subscriber → cancel through RevenueCat. Still run
  // the Stripe email sweep afterwards (it's a no-op for them) so a row that
  // merely LOOKS like this can't skip a real Stripe cancel.
  if (looksLikeRcWebBilling(user) && user.id && opts.rcCancel) {
    let rc: CancellationStatus = "failed";
    try {
      rc = await opts.rcCancel(user.id);
    } catch {
      rc = "failed";
    }
    const stripeResult = await cancelStripe(stripe, user);
    if (rc === "failed" || stripeResult === "failed") return "failed";
    if (rc === "success" || stripeResult === "success") return "success";
    return "not_applicable";
  }

  return cancelStripe(stripe, user);
}

async function cancelStripe(
  stripe: Stripe,
  user: DeletionUser
): Promise<CancellationStatus> {
  // Store-owned subscriptions can't be canceled from the server.
  if (
    user.subscriptionSource === "apple" ||
    user.subscriptionSource === "google_play"
  ) {
    return "not_applicable";
  }

  // Stripe (explicit source, or null source — webhook-outage rows never got
  // subscriptionSource stamped either, so we still attempt Stripe for them).
  try {
    if (user.stripeSubscriptionId) {
      await stripe.subscriptions.cancel(user.stripeSubscriptionId);
      return "success";
    }

    // Local subscription id missing — resolve via customer id, else email.
    const customerIds: string[] = [];
    if (user.stripeCustomerId) {
      customerIds.push(user.stripeCustomerId);
    } else {
      const found = await stripe.customers.list({
        email: user.email,
        limit: 100,
      });
      customerIds.push(...found.data.map((c) => c.id));
    }

    let canceledAny = false;
    for (const customerId of customerIds) {
      const subs = await stripe.subscriptions.list({
        customer: customerId,
        status: "all",
        limit: 100,
      });
      for (const sub of subs.data) {
        if (LIVE_SUB_STATUS.has(sub.status)) {
          await stripe.subscriptions.cancel(sub.id);
          canceledAny = true;
        }
      }
    }
    return canceledAny ? "success" : "not_applicable";
  } catch (err) {
    console.error(
      `[cancelSubscriptionOnDelete] Stripe cancel failed for ${user.email} (proceeding with deletion):`,
      err
    );
    return "failed";
  }
}
