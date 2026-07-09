import "server-only";

import type Stripe from "stripe";

import { safeLog } from "@/lib/safe-log";

/**
 * RevenueEvent ingestion (revenue-accuracy-fix-plan.md RC3 + RC6).
 *
 * Every function here is BEST-EFFORT and SIDE-CAR: the Stripe webhook calls
 * them for their write, never for their return value, and every one swallows
 * its own errors into safeLog. Booking revenue must never be able to fail an
 * entitlement write or 500 the webhook (which would make Stripe retry a
 * subscription-state change we already applied).
 *
 * ── Why not simply "one row per event" ────────────────────────────────────
 * A single subscription payment emits BOTH `charge.succeeded` and
 * `invoice.paid`/`invoice.payment_succeeded`. Booking a row per event double-
 * counts every renewal — precisely the class of bug this table exists to kill.
 * So money-in is booked exactly once per Stripe CHARGE:
 *
 *   invoice.paid / invoice.payment_succeeded → owns the row for any charge
 *     attached to an invoice (all subscription revenue). It knows
 *     `billing_reason` (→ charge vs renewal) and the price interval (→ plan).
 *   charge.succeeded → books ONLY invoice-less charges (true one-offs).
 *     Attached-to-invoice charges are skipped; the invoice event owns them.
 *
 * Both paths upsert on the @@unique([stripeChargeId, type]) key, so redelivery,
 * event overlap, and a re-run of the historical backfill all converge on one
 * row rather than N.
 *
 * ── Refunds ───────────────────────────────────────────────────────────────
 * `charge.refunded` carries the CUMULATIVE `amount_refunded` for the charge,
 * not the delta of the latest refund. So the refund row is upserted to that
 * running total. Two partial refunds on one charge produce ONE row whose
 * amount is the sum — correct, and idempotent under redelivery.
 *
 * Refunds are stored NEGATIVE so lifetime net cash is `SUM(amountCents)` with
 * no CASE, and gross is `SUM(amountCents) WHERE amountCents > 0`.
 */

type Db = (typeof import("@/lib/prisma"))["prisma"];

export type RevenueType = "charge" | "refund" | "renewal";

/** Stripe price interval → our `plan` vocabulary. */
function planFromInvoice(invoice: Stripe.Invoice): string | null {
  const interval = invoice.lines?.data?.[0]?.price?.recurring?.interval;
  if (interval === "year") return "annual";
  if (interval === "month") return "monthly";
  return null;
}

/**
 * Resolve the app user for a Stripe customer. By stripeCustomerId first (the
 * authoritative link), then email. Returns nulls rather than throwing — an
 * unresolvable user must not stop us recording that the money moved.
 */
async function resolveUser(
  db: Db,
  customerId: string | null,
  email: string | null
): Promise<{ userId: string | null; customerEmail: string | null }> {
  try {
    if (customerId) {
      const byCustomer = await db.user.findFirst({
        where: { stripeCustomerId: customerId },
        select: { id: true, email: true },
      });
      if (byCustomer) {
        return { userId: byCustomer.id, customerEmail: byCustomer.email ?? email };
      }
    }
    if (email) {
      const byEmail = await db.user.findUnique({
        where: { email: email.toLowerCase() },
        select: { id: true, email: true },
      });
      if (byEmail) return { userId: byEmail.id, customerEmail: byEmail.email };
    }
  } catch (err) {
    safeLog.warn("revenue-event.user-resolve-failed", {
      customerId,
      err: err instanceof Error ? err.message : String(err),
    });
  }
  return { userId: null, customerEmail: email };
}

/**
 * Upsert one revenue row keyed on (stripeChargeId, type).
 *
 * `stripeEventId` is written but is NOT the upsert key — two different event
 * types legitimately describe the same charge, and the backfill has no event
 * id at all. Its @unique index is the second, independent guard against a
 * redelivered webhook creating a row via some future code path.
 */
async function upsertRevenueEvent(
  db: Db,
  row: {
    source: string;
    type: RevenueType;
    stripeEventId: string | null;
    stripeChargeId: string;
    customerEmail: string | null;
    userId: string | null;
    amountCents: number;
    currency: string;
    plan: string | null;
    occurredAt: Date;
  }
): Promise<void> {
  const { stripeChargeId, type, ...rest } = row;
  await db.revenueEvent.upsert({
    where: { stripeChargeId_type: { stripeChargeId, type } },
    create: { stripeChargeId, type, ...rest },
    // Re-assert the amount: `amount_refunded` grows with each partial refund,
    // and a backfill re-run should correct any earlier bad value.
    update: {
      amountCents: rest.amountCents,
      currency: rest.currency,
      plan: rest.plan,
      occurredAt: rest.occurredAt,
      userId: rest.userId,
      customerEmail: rest.customerEmail,
    },
  });
}

/**
 * `invoice.paid` / `invoice.payment_succeeded` — the money-in path for all
 * subscription revenue. Owns any charge attached to an invoice.
 */
export async function recordInvoicePaid(
  db: Db,
  invoice: Stripe.Invoice,
  eventId: string
): Promise<void> {
  try {
    const chargeId =
      typeof invoice.charge === "string" ? invoice.charge : invoice.charge?.id ?? null;
    if (!chargeId) {
      // $0 invoices (100% coupon, trial-start invoices) move no money.
      safeLog.info("revenue-event.invoice-no-charge", { invoiceId: invoice.id });
      return;
    }
    const amountCents = invoice.amount_paid ?? 0;
    if (amountCents <= 0) return;

    const customerId =
      typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id ?? null;
    const { userId, customerEmail } = await resolveUser(
      db,
      customerId,
      invoice.customer_email ?? null
    );

    await upsertRevenueEvent(db, {
      source: "stripe",
      // A renewal is a `subscription_cycle` invoice. The first payment
      // (`subscription_create`) and anything else is a plain charge.
      type: invoice.billing_reason === "subscription_cycle" ? "renewal" : "charge",
      stripeEventId: eventId,
      stripeChargeId: chargeId,
      customerEmail,
      userId,
      amountCents,
      currency: invoice.currency ?? "usd",
      plan: planFromInvoice(invoice),
      occurredAt: new Date((invoice.status_transitions?.paid_at ?? invoice.created) * 1000),
    });
  } catch (err) {
    safeLog.error("revenue-event.invoice-paid-failed", err, {
      invoiceId: invoice.id,
      eventId,
    });
  }
}

/**
 * `charge.succeeded` — books ONLY invoice-less charges. A charge carrying an
 * `invoice` is subscription revenue and belongs to recordInvoicePaid(); booking
 * it here too would double-count it.
 */
export async function recordChargeSucceeded(
  db: Db,
  charge: Stripe.Charge,
  eventId: string
): Promise<void> {
  try {
    if (charge.invoice) {
      safeLog.info("revenue-event.charge-skipped-has-invoice", { chargeId: charge.id });
      return;
    }
    if (!charge.paid || charge.amount <= 0) return;

    const customerId =
      typeof charge.customer === "string" ? charge.customer : charge.customer?.id ?? null;
    const { userId, customerEmail } = await resolveUser(
      db,
      customerId,
      charge.billing_details?.email ?? charge.receipt_email ?? null
    );

    await upsertRevenueEvent(db, {
      source: "stripe",
      type: "charge",
      stripeEventId: eventId,
      stripeChargeId: charge.id,
      customerEmail,
      userId,
      amountCents: charge.amount,
      currency: charge.currency ?? "usd",
      plan: null,
      occurredAt: new Date(charge.created * 1000),
    });
  } catch (err) {
    safeLog.error("revenue-event.charge-succeeded-failed", err, {
      chargeId: charge.id,
      eventId,
    });
  }
}

/**
 * `charge.refunded` — one negative row per charge, carrying the CUMULATIVE
 * refunded total. Upsert, not create: a second partial refund updates the same
 * row rather than appending.
 */
export async function recordChargeRefunded(
  db: Db,
  charge: Stripe.Charge,
  eventId: string
): Promise<void> {
  try {
    const refunded = charge.amount_refunded ?? 0;
    if (refunded <= 0) return;

    const customerId =
      typeof charge.customer === "string" ? charge.customer : charge.customer?.id ?? null;
    const { userId, customerEmail } = await resolveUser(
      db,
      customerId,
      charge.billing_details?.email ?? charge.receipt_email ?? null
    );

    // Timestamp of the most recent refund, falling back to the charge itself.
    const latestRefundAt = charge.refunds?.data?.reduce<number>(
      (max, r) => Math.max(max, r.created ?? 0),
      0
    );

    await upsertRevenueEvent(db, {
      source: "stripe",
      type: "refund",
      stripeEventId: eventId,
      stripeChargeId: charge.id,
      customerEmail,
      userId,
      amountCents: -refunded, // NEGATIVE
      currency: charge.currency ?? "usd",
      plan: null,
      occurredAt: new Date((latestRefundAt || charge.created) * 1000),
    });
  } catch (err) {
    safeLog.error("revenue-event.charge-refunded-failed", err, {
      chargeId: charge.id,
      eventId,
    });
  }
}
