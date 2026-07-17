import type Stripe from "stripe";

/**
 * Subscription cancellation at account-deletion time.
 *
 * Incident 2026-07-15 (carmenaroberts): a user whose renewal had failed was
 * downgraded to subscriptionStatus=FREE by the dunning webhook, then deleted her
 * account. The OLD helper gated on `BILLABLE_STATUS.has(subscriptionStatus)` and
 * returned "not_applicable" for FREE — so it NEVER LOOKED at Stripe, her live
 * past_due subscription survived deletion, and Stripe kept trying to bill a
 * deleted account. `subscriptionStatus` is our local guess; it is not evidence
 * of what Stripe is doing, and the two diverge (dunning, webhook drift).
 *
 * This version:
 *   1. ALWAYS resolves the customer in Stripe — by subscription id, then
 *      customer id, then email — regardless of local subscriptionStatus, and
 *      acts on what Stripe actually reports.
 *   2. Cancels every live subscription AND voids any open invoice. Cancelling
 *      alone does not stop collection on an already-open (dunning) invoice —
 *      the void is a separate, required call (confirmed on Carmen 2026-07-17).
 *   3. Returns a real, specific outcome. "not_applicable" is gone: it used to
 *      mean "we didn't look", which is exactly the bug.
 *
 * Apple / Google Play subscriptions are store-owned and CANNOT be canceled
 * server-side — only the user can, in iOS Settings / the Play Store. For those
 * we return "iap_user_warned"; the delete UI shows an unmissable, always-on
 * warning with a link to the store settings page (it is NOT gated on local
 * PRO state, which the same dunning bug can falsify).
 *
 * NEVER throws: the user's right to delete trumps our ability to cancel
 * cleanly. Stripe errors are caught and surfaced as "failed" so the caller can
 * alert founders (deletion still proceeds — we don't hold data hostage) and a
 * human can finish the cancellation manually.
 */

export type CancellationOutcome =
  | "cancelled" // we cancelled ≥1 live Stripe sub and voided any open invoice
  | "already_cancelled" // Stripe had sub(s) for this user, none still live
  | "none_found" // no Stripe customer/subscription resolved for this user
  | "iap_user_warned" // store-owned (Apple/Google) sub we can't cancel; UI warns
  | "failed"; // a Stripe call threw — caller must alert; deletion still proceeds

export type DeletionUser = {
  email: string;
  // Retained for the tombstone/context only. Intentionally NOT used to decide
  // whether to look at Stripe — that gate was the bug.
  subscriptionStatus: string;
  subscriptionSource: string | null;
  stripeSubscriptionId: string | null;
  stripeCustomerId: string | null;
};

// Stripe subscription.status values that are still live (would bill).
const LIVE_SUB_STATUS = new Set(["trialing", "active", "past_due", "unpaid"]);

/**
 * Resolve every Stripe customer id this user could own, without trusting local
 * status: explicit customer id, the customer behind the subscription id, else a
 * lookup by email (closes the webhook-outage case where local ids were never
 * written).
 */
async function resolveCustomerIds(
  stripe: Stripe,
  user: DeletionUser
): Promise<string[]> {
  const ids = new Set<string>();
  if (user.stripeCustomerId) ids.add(user.stripeCustomerId);

  if (user.stripeSubscriptionId) {
    try {
      const s = await stripe.subscriptions.retrieve(user.stripeSubscriptionId);
      ids.add(typeof s.customer === "string" ? s.customer : s.customer.id);
    } catch {
      // Stale/deleted subscription id — fall through to the other resolvers.
    }
  }

  if (ids.size === 0) {
    const found = await stripe.customers.list({ email: user.email, limit: 100 });
    for (const c of found.data) ids.add(c.id);
  }

  return [...ids];
}

/** Void every OPEN invoice on a customer so an in-flight dunning invoice can't
 *  still collect from a now-deleted account. */
async function voidOpenInvoices(stripe: Stripe, customerId: string): Promise<void> {
  const open = await stripe.invoices.list({
    customer: customerId,
    status: "open",
    limit: 100,
  });
  for (const inv of open.data) {
    if (inv.id) await stripe.invoices.voidInvoice(inv.id);
  }
}

export async function cancelSubscriptionOnDelete(
  stripe: Stripe,
  user: DeletionUser
): Promise<CancellationOutcome> {
  const isIap =
    user.subscriptionSource === "apple" ||
    user.subscriptionSource === "google_play";

  try {
    const customerIds = await resolveCustomerIds(stripe, user);

    const allSubs: Stripe.Subscription[] = [];
    const customersWithLive = new Set<string>();
    for (const cid of customerIds) {
      const list = await stripe.subscriptions.list({
        customer: cid,
        status: "all",
        limit: 100,
      });
      for (const s of list.data) {
        allSubs.push(s);
        if (LIVE_SUB_STATUS.has(s.status)) customersWithLive.add(cid);
      }
    }

    if (allSubs.length === 0) {
      // We looked and Stripe has nothing. For an IAP user the (store-owned)
      // sub simply isn't visible to us; the UI warning is the safeguard.
      return isIap ? "iap_user_warned" : "none_found";
    }

    const live = allSubs.filter((s) => LIVE_SUB_STATUS.has(s.status));
    if (live.length === 0) {
      return isIap ? "iap_user_warned" : "already_cancelled";
    }

    // Cancel every live sub, then void open invoices — both are required to
    // fully stop billing (cancel stops future invoices; void stops the current
    // dunning invoice's retries).
    for (const sub of live) {
      await stripe.subscriptions.cancel(sub.id);
    }
    for (const cid of customersWithLive) {
      await voidOpenInvoices(stripe, cid);
    }

    return "cancelled";
  } catch (err) {
    console.error(
      `[cancelSubscriptionOnDelete] Stripe cancel failed for ${user.email} (deletion still proceeds; founders alerted):`,
      err
    );
    return "failed";
  }
}
