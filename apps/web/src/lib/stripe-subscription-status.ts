/**
 * Single source of truth for "given a Stripe subscription status, what should
 * our User.subscriptionStatus be?"
 *
 * Extracted from the Stripe webhook (applySubscriptionState) so the nightly
 * reconciliation job can import the EXACT same mapping rather than reimplement
 * it. If these two ever diverge, the reconciler would "correct" rows to a value
 * the webhook never writes — i.e. it would lie. Keep this the only copy.
 *
 * NOTE: intentionally NO "server-only" import — this pure function is also
 * imported by the standalone reconcile script (run via tsx, outside Next).
 *
 *   active | trialing            → "PRO"   (has access)
 *   past_due | unpaid            → "FREE"  (no-grace downgrade, 2026-06-12 spec)
 *   canceled | incomplete_expired→ "FREE"  (terminal)
 *   incomplete                   → null    (first charge pending — leave the
 *                                           row alone; a later paid event flips
 *                                           it to PRO)
 *   paused / anything unknown    → null    (no opinion; never guess a downgrade)
 */
export type DesiredSubscriptionStatus = "PRO" | "FREE";

export function mapStripeSubscriptionStatus(
  status: string
): DesiredSubscriptionStatus | null {
  if (status === "active" || status === "trialing") return "PRO";
  if (
    status === "past_due" ||
    status === "unpaid" ||
    status === "canceled" ||
    status === "incomplete_expired"
  )
    return "FREE";
  // "incomplete" and any unmapped/future status → no opinion.
  return null;
}

/**
 * Dunning = a failing renewal charge (the same billing episode
 * invoice.payment_failed handles), as opposed to a clean cancel. Drives whether
 * a FREE downgrade should stamp the recovery anchor (stripeFirstFailureAt).
 */
export function isDunningStatus(status: string): boolean {
  return status === "past_due" || status === "unpaid";
}
