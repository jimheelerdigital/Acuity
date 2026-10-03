/**
 * Shared Meta event ids (2026-10-02). The browser pixel and the server CAPI
 * both send Purchase for the same checkout; Meta only dedupes the pair when
 * both carry the same event_id (and same event name) within 48h. Keyed on the
 * Stripe Checkout Session id, which the webhook and the funnel's return URL
 * (?session_id=…) both have. Also dedupes repeat browser fires on reload.
 */
export function purchaseEventId(stripeCheckoutSessionId: string): string {
  return `purchase_${stripeCheckoutSessionId}`;
}
