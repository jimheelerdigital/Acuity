import "server-only";

/**
 * Payment-provider events → creator ledger.
 *
 *   Stripe (web):          invoice.payment_succeeded, charge.refunded,
 *                          charge.dispute.created, charge.dispute.closed
 *   RevenueCat (app):      APP_STORE / PLAY_STORE purchases, renewals, plan
 *                          changes and refunds. Its STRIPE / RC_BILLING events
 *                          are skipped — web money comes from Stripe directly,
 *                          so nothing is counted twice (decision 2026-10-22).
 *
 * Both entry points are called from the existing webhooks AFTER their own
 * work, wrapped so a ledger failure can never affect billing.
 */

import type Stripe from "stripe";

import { prisma } from "@/lib/prisma";
import { safeLog } from "@/lib/safe-log";

import { recordDisputeWon, recordPayment, recordReversal } from "./ledger";

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

const APP_STORES: Record<string, "app_store" | "play_store"> = {
  APP_STORE: "app_store",
  MAC_APP_STORE: "app_store",
  PLAY_STORE: "play_store",
};
const PAYMENT_TYPES = new Set(["INITIAL_PURCHASE", "RENEWAL", "PRODUCT_CHANGE", "NON_RENEWING_PURCHASE"]);

function rcUserIds(e: RcMoneyEvent): string[] {
  const ids = [e.app_user_id, e.original_app_user_id, ...(e.aliases ?? [])].filter(
    (x): x is string => typeof x === "string" && x.length > 0 && !x.startsWith("$RCAnonymousID")
  );
  return Array.from(new Set(ids));
}

/** Dispatch one authorized RC event. Never throws. */
export async function handleRevenueCatEventForCreators(e: RcMoneyEvent): Promise<void> {
  try {
    const store = APP_STORES[(e.store ?? "").toUpperCase()];
    if (!store) return; // STRIPE / RC_BILLING / PROMOTIONAL: not ours
    const sandbox = (e.environment ?? "").toUpperCase() === "SANDBOX";
    if (sandbox && process.env.CREATOR_ACCEPT_SANDBOX !== "1") return;

    const ids = rcUserIds(e);
    if (ids.length === 0) return;
    const ref = await prisma.creatorReferral.findFirst({
      where: { userId: { in: ids } },
      select: { userId: true },
    });
    if (!ref) return;

    const type = (e.type ?? "").toUpperCase();
    const price = typeof e.price === "number" ? e.price : 0;
    const txn = e.transaction_id ?? null;
    const occurredAt = new Date(e.purchased_at_ms ?? e.event_timestamp_ms ?? Date.now());

    if (PAYMENT_TYPES.has(type)) {
      if ((e.period_type ?? "").toUpperCase() === "TRIAL" || price <= 0) return;
      const amount = Math.round(price * 100);
      const res = await recordPayment({
        userId: ref.userId,
        source: "revenuecat",
        store,
        externalEventId: txn ? `rc:txn:${txn}` : `rc:evt:${e.id}`,
        providerEventId: e.id ?? null,
        plan: planFromProductId(e.product_id),
        amountPaid: amount,
        tax: Math.round(amount * Math.max(0, Math.min(1, e.tax_percentage ?? 0))),
        currency: "usd", // RC `price` is always USD
        occurredAt,
      });
      safeLog.info("creators.rc.payment", { eventId: e.id, type, ...res });
      return;
    }

    // Refunds arrive as CANCELLATION (CUSTOMER_SUPPORT) with a negative price.
    const isRefund =
      type === "CANCELLATION" &&
      ((e.cancel_reason ?? "").toUpperCase() === "CUSTOMER_SUPPORT" || price < 0);
    if (isRefund && txn) {
      const payment = await prisma.creatorRevenueEvent.findUnique({
        where: { externalEventId: `rc:txn:${txn}` },
        select: { amountPaid: true },
      });
      if (!payment) return;
      const res = await recordReversal({
        paymentExternalId: `rc:txn:${txn}`,
        type: "refund",
        source: "revenuecat",
        externalEventId: `rc:refund:${e.id ?? txn}`,
        providerEventId: e.id ?? null,
        amount: price < 0 ? Math.round(-price * 100) : payment.amountPaid,
        occurredAt: new Date(e.event_timestamp_ms ?? Date.now()),
      });
      safeLog.info("creators.rc.refund", { eventId: e.id, res });
    }
  } catch (err) {
    safeLog.error("creators.rc-event-failed", err, { id: e.id, type: e.type });
  }
}
