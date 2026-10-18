import type Stripe from "stripe";

/**
 * Shared bits for the failed-payment path (2026-10-18, audit R-2026-10-10-1).
 *
 * Two questions the webhook and the follow-up emails both need answered:
 *   1. Was this the FIRST charge after the free trial, or a renewal? The
 *      copy differs, and admin wants trial-end declines split out.
 *   2. Is there still an open invoice to pay, and what is its hosted URL?
 */

/** Stripe-side signals that decide "first post-trial charge". */
export interface FirstChargeSignals {
  billingReason: string | null | undefined;
  /** subscription.trial_end (unix seconds), null when the sub had no trial. */
  trialEndSec: number | null | undefined;
  /** Did the subscription have ANY paid invoice before this one? */
  hadEarlierPaidInvoice: boolean;
  /** When the failure happened (defaults to now). */
  now?: Date;
}

export const FIRST_CHARGE_TRIAL_WINDOW_DAYS = 3;

/**
 * First post-trial charge = a subscription_cycle invoice where either the
 * trial ended within the last 3 days or nothing was ever paid before.
 * Pure; the webhook gathers the signals, tests pin the rule.
 */
export function isFirstPostTrialCharge(s: FirstChargeSignals): boolean {
  if (s.billingReason !== "subscription_cycle") return false;
  if (!s.hadEarlierPaidInvoice) return true;
  if (!s.trialEndSec) return false;
  const now = (s.now ?? new Date()).getTime();
  const trialEndMs = s.trialEndSec * 1000;
  const ageMs = now - trialEndMs;
  return ageMs >= 0 && ageMs <= FIRST_CHARGE_TRIAL_WINDOW_DAYS * 24 * 60 * 60 * 1000;
}

/** The value written to OnboardingEvent funnel_payment_failed. */
export function paymentFailedEventValue(declineCode: string, firstCharge: boolean): string {
  return `decline:${declineCode};first_charge:${firstCharge ? "true" : "false"}`;
}

/** Inverse of paymentFailedEventValue; tolerant of the pre-10/18 format. */
export function parsePaymentFailedEventValue(value: string | null | undefined): {
  declineCode: string;
  firstCharge: boolean | null;
} {
  const v = value ?? "";
  const decline = /(?:^|;)decline:([^;]*)/.exec(v)?.[1] ?? "unknown";
  const fc = /(?:^|;)first_charge:(true|false)/.exec(v)?.[1];
  return { declineCode: decline || "unknown", firstCharge: fc ? fc === "true" : null };
}

type StripeLike = Pick<Stripe, "subscriptions" | "invoices">;

/**
 * Gather the first-charge signals for an invoice from Stripe. Best-effort:
 * any API error → "not first charge" (the renewal copy is the safe default,
 * it makes no claim about a free week).
 */
export async function detectFirstPostTrialCharge(
  stripe: StripeLike,
  invoice: Pick<Stripe.Invoice, "id" | "billing_reason" | "subscription">,
  now: Date = new Date()
): Promise<boolean> {
  if (invoice.billing_reason !== "subscription_cycle") return false;
  const subId = typeof invoice.subscription === "string" ? invoice.subscription : invoice.subscription?.id ?? null;
  if (!subId) return false;
  try {
    const [sub, paid] = await Promise.all([
      stripe.subscriptions.retrieve(subId),
      stripe.invoices.list({ subscription: subId, status: "paid", limit: 3 }),
    ]);
    const earlierPaid = paid.data.some((i) => i.id !== invoice.id && (i.amount_paid ?? 0) > 0);
    return isFirstPostTrialCharge({
      billingReason: invoice.billing_reason,
      trialEndSec: sub.trial_end,
      hadEarlierPaidInvoice: earlierPaid,
      now,
    });
  } catch {
    return false;
  }
}

/**
 * The customer's open invoice, if any. Used by the +2d/+5d follow-ups to
 * decide whether there is still something to pay and where to send them.
 * Returns null when nothing is open (paid, voided, or the sub was canceled).
 */
export async function findOpenInvoice(
  stripe: StripeLike,
  customerId: string
): Promise<{ id: string; hostedInvoiceUrl: string | null; amountDue: number; currency: string; billingReason: string | null; subscription: string | null } | null> {
  const res = await stripe.invoices.list({ customer: customerId, status: "open", limit: 1 });
  const inv = res.data[0];
  if (!inv) return null;
  return {
    id: inv.id,
    hostedInvoiceUrl: inv.hosted_invoice_url ?? null,
    amountDue: inv.amount_due,
    currency: inv.currency,
    billingReason: inv.billing_reason ?? null,
    subscription: typeof inv.subscription === "string" ? inv.subscription : inv.subscription?.id ?? null,
  };
}
