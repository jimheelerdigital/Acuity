import "server-only";

/**
 * Payment-provider events → creator ledger.
 *
 *   Stripe (web):          invoice.payment_succeeded, charge.refunded,
 *                          charge.dispute.created, charge.dispute.closed
 *   RevenueCat:            APP_STORE / PLAY_STORE / RC_BILLING (Web Billing)
 *                          purchases and renewals, refunds, refund reversals.
 *                          Its STRIPE events are skipped — Stripe Checkout
 *                          money comes from the Stripe webhook, so nothing is
 *                          counted twice. RC_BILLING is counted since
 *                          2026-10-28 (Web Billing isn't Stripe Billing, so
 *                          the Stripe webhook never sees an invoice for it).
 *   Apple (direct):        App Store Server Notifications REFUND /
 *                          REFUND_REVERSED — per transaction, any period.
 *
 * Both entry points are called from the existing webhooks AFTER their own
 * work, wrapped so a ledger failure can never affect billing.
 */

import type Stripe from "stripe";

import { prisma } from "@/lib/prisma";
import { safeLog } from "@/lib/safe-log";

import {
  recordDisputeWon,
  recordPayment,
  recordRefundReversed,
  recordReversal,
  storePaymentKey,
  storeRefundKey,
} from "./ledger";

function planFromInterval(interval: string | null | undefined): string {
  return interval === "year" || interval === "yearly" ? "annual" : "monthly";
}

function planFromProductId(productId: string | null | undefined): string {
  const p = (productId ?? "").toLowerCase();
  if (/annual|year|yearly|12m/.test(p)) return "annual";
  if (/month|1m/.test(p)) return "monthly";
  return productId ?? "unknown";
}

async function referredUserForStripeCustomer(customerId: string): Promise<string | null> {
  const user = await prisma.user.findFirst({
    where: { stripeCustomerId: customerId },
    select: { id: true },
  });
  if (!user) return null;
  const ref = await prisma.creatorReferral.findUnique({
    where: { userId: user.id },
    select: { id: true },
  });
  return ref ? user.id : null;
}

async function stripeClient() {
  const { stripe } = await import("@/lib/stripe");
  return stripe;
}

/** Dispatch one verified Stripe event. Never throws. */
export async function handleStripeEventForCreators(event: Stripe.Event): Promise<void> {
  try {
    switch (event.type) {
      case "invoice.payment_succeeded":
        await onStripeInvoicePaid(event, event.data.object as Stripe.Invoice);
        break;
      case "charge.refunded":
        await onStripeChargeRefunded(event, event.data.object as Stripe.Charge);
        break;
      case "charge.dispute.created":
        await onStripeDispute(event, event.data.object as Stripe.Dispute);
        break;
      case "charge.dispute.closed": {
        const d = event.data.object as Stripe.Dispute;
        if (d.status === "won") {
          await recordDisputeWon({
            disputeExternalId: `stripe:dispute:${d.id}`,
            externalEventId: `stripe:dispute_won:${d.id}`,
            providerEventId: event.id,
            occurredAt: new Date(event.created * 1000),
          });
        }
        break;
      }
      default:
        break;
    }
  } catch (err) {
    safeLog.error("creators.stripe-event-failed", err, { id: event.id, type: event.type });
  }
}

async function onStripeInvoicePaid(event: Stripe.Event, invoice: Stripe.Invoice) {
  const customerId = typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id;
  if (!customerId || !(invoice.amount_paid > 0)) return;
  const userId = await referredUserForStripeCustomer(customerId);
  if (!userId) return;
  // Same money already counted from RevenueCat (Web Billing) → don't count twice.
  const viaRc = await prisma.creatorRevenueEvent.findUnique({
    where: { externalEventId: storePaymentKey(invoice.id) },
    select: { id: true },
  });
  if (viaRc) return;

  // `invoice.tax` is the sum of every tax amount (inclusive and exclusive).
  const tax = invoice.tax ?? (invoice.total_tax_amounts ?? []).reduce((s, t) => s + t.amount, 0);
  const discount = (invoice.total_discount_amounts ?? []).reduce((s, d) => s + d.amount, 0);

  let fingerprint: string | null = null;
  const chargeId = typeof invoice.charge === "string" ? invoice.charge : invoice.charge?.id;
  if (chargeId) {
    try {
      const charge = await (await stripeClient()).charges.retrieve(chargeId);
      fingerprint = charge.payment_method_details?.card?.fingerprint ?? null;
    } catch {
      /* fingerprint is nice-to-have */
    }
  }
  const paidAt = invoice.status_transitions?.paid_at ?? event.created;
  const res = await recordPayment({
    userId,
    source: "stripe",
    store: "stripe",
    externalEventId: `stripe:inv:${invoice.id}`,
    providerEventId: event.id,
    plan: planFromInterval(invoice.lines.data[0]?.price?.recurring?.interval),
    amountPaid: invoice.amount_paid,
    discount,
    tax,
    currency: invoice.currency,
    occurredAt: new Date(paidAt * 1000),
    paymentFingerprint: fingerprint,
  });
  safeLog.info("creators.stripe.payment", { invoiceId: invoice.id, ...res });
}

async function onStripeChargeRefunded(event: Stripe.Event, charge: Stripe.Charge) {
  const invoiceId = typeof charge.invoice === "string" ? charge.invoice : charge.invoice?.id;
  if (!invoiceId) return;
  const paymentExternalId = `stripe:inv:${invoiceId}`;
  const payment = await prisma.creatorRevenueEvent.findUnique({
    where: { externalEventId: paymentExternalId },
    select: { id: true },
  });
  if (!payment) return;
  // charge.amount_refunded is cumulative; record only the new part.
  const prior = await prisma.creatorRevenueEvent.aggregate({
    where: { relatesToId: payment.id, type: "refund" },
    _sum: { amountPaid: true },
  });
  const delta = charge.amount_refunded - (prior._sum.amountPaid ?? 0);
  if (delta <= 0) return;
  const res = await recordReversal({
    paymentExternalId,
    type: "refund",
    source: "stripe",
    externalEventId: `stripe:refund:${charge.id}:${charge.amount_refunded}`,
    providerEventId: event.id,
    amount: delta,
    occurredAt: new Date(event.created * 1000),
  });
  safeLog.info("creators.stripe.refund", { chargeId: charge.id, delta, res });
}

async function onStripeDispute(event: Stripe.Event, dispute: Stripe.Dispute) {
  const chargeId = typeof dispute.charge === "string" ? dispute.charge : dispute.charge?.id;
  if (!chargeId) return;
  const charge = await (await stripeClient()).charges.retrieve(chargeId);
  const invoiceId = typeof charge.invoice === "string" ? charge.invoice : charge.invoice?.id;
  if (!invoiceId) return;
  const res = await recordReversal({
    paymentExternalId: `stripe:inv:${invoiceId}`,
    type: "dispute",
    source: "stripe",
    externalEventId: `stripe:dispute:${dispute.id}`,
    providerEventId: event.id,
    amount: dispute.amount,
    occurredAt: new Date(event.created * 1000),
  });
  safeLog.info("creators.stripe.dispute", { disputeId: dispute.id, res });
}

// ── RevenueCat ────────────────────────────────────────────────────────

/** The RC webhook fields this module reads (superset of lib/revenuecat's type). */
export interface RcMoneyEvent {
  id?: string;
  type?: string;
  app_user_id?: string | null;
  original_app_user_id?: string | null;
  aliases?: string[] | null;
  product_id?: string | null;
  period_type?: string | null;
  purchased_at_ms?: number | null;
  event_timestamp_ms?: number | null;
  store?: string | null;
  environment?: string | null;
  cancel_reason?: string | null;
  transaction_id?: string | null;
  original_transaction_id?: string | null;
  /** USD price of the transaction, tax included; negative on refunds. */
  price?: number | null;
  tax_percentage?: number | null;
  currency?: string | null;
}

/**
 * RC stores we count. RC_BILLING (RevenueCat Web Billing) is counted here:
 * RC runs its own recurring billing (not Stripe Billing), so those payments
 * never produce the Stripe invoices our Stripe webhook counts. Store STRIPE
 * stays skipped — those are Stripe Checkout subscriptions RC merely mirrors,
 * and the Stripe webhook already counts their invoices. PROMOTIONAL etc.
 * carry no money.
 */
const RC_STORES: Record<string, "app_store" | "play_store" | "rc_billing"> = {
  APP_STORE: "app_store",
  MAC_APP_STORE: "app_store",
  PLAY_STORE: "play_store",
  RC_BILLING: "rc_billing",
};
/**
 * Events that are a charge. PRODUCT_CHANGE is NOT one: RC sends it to say a
 * plan change was requested ("doesn't mean the new subscription is in effect
 * immediately"); the charge for an immediate change arrives as its own
 * RENEWAL (App Store) / INITIAL_PURCHASE (Play), and a deferred change is
 * charged at the next RENEWAL. Counting it double-counted (or pre-counted)
 * the money. (RC docs: event-types-and-fields, event-flows; finding 6.)
 */
const PAYMENT_TYPES = new Set(["INITIAL_PURCHASE", "RENEWAL", "NON_RENEWING_PURCHASE"]);

function rcUserIds(e: RcMoneyEvent): string[] {
  const ids = [e.app_user_id, e.original_app_user_id, ...(e.aliases ?? [])].filter(
    (x): x is string => typeof x === "string" && x.length > 0 && !x.startsWith("$RCAnonymousID")
  );
  return Array.from(new Set(ids));
}

/** What the RC handler should do with one event. PURE. */
export type RcMoneyAction =
  | { kind: "ignore"; reason: string }
  | { kind: "payment"; store: "app_store" | "play_store" | "rc_billing"; amountCents: number; taxCents: number }
  | { kind: "refund"; store: "app_store" | "play_store" | "rc_billing"; transactionId: string; amountCents: number | null }
  | { kind: "refund_reversed"; transactionId: string };

export function classifyRcMoneyEvent(e: RcMoneyEvent, acceptSandbox = false): RcMoneyAction {
  const store = RC_STORES[(e.store ?? "").toUpperCase()];
  if (!store) return { kind: "ignore", reason: `store ${e.store ?? "none"} not counted from RC` };
  if ((e.environment ?? "").toUpperCase() === "SANDBOX" && !acceptSandbox) {
    return { kind: "ignore", reason: "sandbox" };
  }
  const type = (e.type ?? "").toUpperCase();
  const price = typeof e.price === "number" && Number.isFinite(e.price) ? e.price : 0;
  const txn = e.transaction_id ?? null;

  if (PAYMENT_TYPES.has(type)) {
    if ((e.period_type ?? "").toUpperCase() === "TRIAL" || price <= 0) {
      return { kind: "ignore", reason: "no charge (trial or zero price)" };
    }
    const amountCents = Math.round(price * 100);
    return {
      kind: "payment",
      store,
      amountCents,
      taxCents: Math.round(amountCents * Math.max(0, Math.min(1, e.tax_percentage ?? 0))),
    };
  }

  // A refund of the LATEST period arrives as CANCELLATION (CUSTOMER_SUPPORT,
  // negative price). Earlier periods get no RC event at all — those are
  // caught by Apple's REFUND notification and the pre-payout store check
  // (lib/creators/refund-reconcile). Finding 7.
  if (type === "CANCELLATION" && txn) {
    const refund = (e.cancel_reason ?? "").toUpperCase() === "CUSTOMER_SUPPORT" || price < 0;
    if (refund) {
      return { kind: "refund", store, transactionId: txn, amountCents: price < 0 ? Math.round(-price * 100) : null };
    }
  }
  // App Store only (per RC): the refund was undone, the money is back.
  if (type === "REFUND_REVERSED" && txn) return { kind: "refund_reversed", transactionId: txn };
  return { kind: "ignore", reason: `type ${type || "none"} carries no money` };
}

/**
 * Has this transaction already been counted from Stripe? Belt and braces for
 * RC_BILLING: Web Billing has no Stripe invoices today, but if RC ever
 * reports a Stripe invoice id as the transaction, the Stripe row wins.
 */
async function countedFromStripe(transactionId: string): Promise<boolean> {
  if (!transactionId.startsWith("in_")) return false;
  const row = await prisma.creatorRevenueEvent.findUnique({
    where: { externalEventId: `stripe:inv:${transactionId}` },
    select: { id: true },
  });
  return Boolean(row);
}

/** Dispatch one authorized RC event. Never throws. */
export async function handleRevenueCatEventForCreators(e: RcMoneyEvent): Promise<void> {
  try {
    const action = classifyRcMoneyEvent(e, process.env.CREATOR_ACCEPT_SANDBOX === "1");
    if (action.kind === "ignore") return;

    if (action.kind === "refund") {
      const res = await recordStoreRefund({
        transactionId: action.transactionId,
        amountCents: action.amountCents,
        providerEventId: e.id ?? null,
        occurredAt: new Date(e.event_timestamp_ms ?? Date.now()),
      });
      safeLog.info("creators.rc.refund", { eventId: e.id, res });
      return;
    }
    if (action.kind === "refund_reversed") {
      const undone = await recordRefundReversed({
        transactionId: action.transactionId,
        providerEventId: e.id ?? null,
        occurredAt: new Date(e.event_timestamp_ms ?? Date.now()),
      });
      safeLog.info("creators.rc.refund-reversed", { eventId: e.id, undone });
      return;
    }

    const ids = rcUserIds(e);
    if (ids.length === 0) return;
    const ref = await prisma.creatorReferral.findFirst({
      where: { userId: { in: ids } },
      select: { userId: true },
    });
    if (!ref) return;

    const txn = e.transaction_id ?? null;
    if (txn && action.store === "rc_billing" && (await countedFromStripe(txn))) {
      safeLog.info("creators.rc.payment-skipped-counted-by-stripe", { eventId: e.id });
      return;
    }
    const res = await recordPayment({
      userId: ref.userId,
      source: "revenuecat",
      store: action.store,
      externalEventId: txn ? storePaymentKey(txn) : `rc:evt:${e.id}`,
      providerEventId: e.id ?? null,
      plan: planFromProductId(e.product_id),
      amountPaid: action.amountCents,
      tax: action.taxCents,
      currency: "usd", // RC `price` is always USD
      occurredAt: new Date(e.purchased_at_ms ?? e.event_timestamp_ms ?? Date.now()),
    });
    safeLog.info("creators.rc.payment", { eventId: e.id, type: e.type, store: action.store, ...res });
  } catch (err) {
    safeLog.error("creators.rc-event-failed", err, { id: e.id, type: e.type });
  }
}

/**
 * Claw back a refunded store transaction (any RC-sourced payment). One
 * record per transaction whichever path reports it first (storeRefundKey).
 * amountCents null = the whole payment.
 */
export async function recordStoreRefund(params: {
  transactionId: string;
  amountCents: number | null;
  providerEventId?: string | null;
  occurredAt: Date;
}) {
  const paymentExternalId = storePaymentKey(params.transactionId);
  const payment = await prisma.creatorRevenueEvent.findUnique({
    where: { externalEventId: paymentExternalId },
    select: { amountPaid: true },
  });
  if (!payment) return null; // not a referred payment
  return recordReversal({
    paymentExternalId,
    type: "refund",
    source: "revenuecat",
    externalEventId: storeRefundKey(params.transactionId),
    providerEventId: params.providerEventId ?? null,
    amount: params.amountCents && params.amountCents > 0 ? params.amountCents : payment.amountPaid,
    occurredAt: params.occurredAt,
  });
}

/**
 * Apple's own App Store Server Notification (forwarded to
 * /api/iap/notifications). REFUND names the exact refunded transaction —
 * any period, not just the latest — so it closes the gap RC's CANCELLATION
 * leaves. REFUND_REVERSED undoes it. Never throws.
 */
export async function handleAppleNotificationForCreators(n: {
  notificationType: string;
  transactionId: string | null;
  revocationDate?: number | null;
  notificationUUID?: string | null;
}): Promise<void> {
  try {
    if (!n.transactionId) return;
    if (n.notificationType === "REFUND") {
      const res = await recordStoreRefund({
        transactionId: n.transactionId,
        amountCents: null,
        providerEventId: n.notificationUUID ?? null,
        occurredAt: new Date(n.revocationDate ?? Date.now()),
      });
      if (res) safeLog.info("creators.apple.refund", { notificationUUID: n.notificationUUID, res });
    } else if (n.notificationType === "REFUND_REVERSED") {
      const undone = await recordRefundReversed({
        transactionId: n.transactionId,
        providerEventId: n.notificationUUID ?? null,
        occurredAt: new Date(),
      });
      if (undone) safeLog.info("creators.apple.refund-reversed", { notificationUUID: n.notificationUUID, undone });
    }
  } catch (err) {
    safeLog.error("creators.apple-notification-failed", err, { type: n.notificationType });
  }
}
