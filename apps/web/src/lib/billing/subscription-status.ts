/**
 * Pure derivation of our subscription state from a Stripe subscription
 * object. Extracted from the `customer.subscription.updated` webhook
 * handler so the mapping (and the cancel-at-period-end flag) can be unit
 * tested without Stripe signatures or a DB.
 *
 * NO-grace policy (2026-06-12): active/trialing → PRO; any non-active
 * terminal/failed state → FREE immediately. Unknown statuses map to null
 * (the webhook logs and no-ops them).
 */

export type StripeSubLike = {
  status: string;
  cancel_at_period_end: boolean;
  /** Unix seconds, or null when Stripe omits it. */
  current_period_end: number | null;
};

export type SubscriptionUpdateDerivation = {
  /** Our vocab, or null when Stripe's status isn't one we map. */
  nextStatus: "PRO" | "FREE" | null;
  /**
   * Whether the sub is scheduled to cancel at period end. Only meaningful
   * for an active (PRO) sub — a FREE/terminal sub is no longer "scheduled to
   * cancel", so we coerce it to false to avoid a stale flag lingering on a
   * downgraded row.
   */
  cancelAtPeriodEnd: boolean;
  /** The access-until / renewal date, or null when Stripe omits it. */
  currentPeriodEnd: Date | null;
};

const FREE_STATUSES = new Set([
  "past_due",
  "unpaid",
  "canceled",
  "incomplete_expired",
]);

export function deriveSubscriptionUpdate(
  sub: StripeSubLike
): SubscriptionUpdateDerivation {
  let nextStatus: "PRO" | "FREE" | null = null;
  if (sub.status === "active" || sub.status === "trialing") {
    nextStatus = "PRO";
  } else if (FREE_STATUSES.has(sub.status)) {
    nextStatus = "FREE";
  }

  return {
    nextStatus,
    cancelAtPeriodEnd: nextStatus === "PRO" ? sub.cancel_at_period_end : false,
    currentPeriodEnd: sub.current_period_end
      ? new Date(sub.current_period_end * 1000)
      : null,
  };
}
