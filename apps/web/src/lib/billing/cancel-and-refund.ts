/**
 * Shared cancel + refund logic for a single customer's subscription.
 *
 * Dependency-injected on purpose: it takes the Stripe client and a Prisma
 * client as arguments and imports neither `@/lib/stripe`, `@/lib/prisma`,
 * nor `server-only`. That keeps it usable from BOTH:
 *   - the admin route (apps/web/src/app/api/admin/users/[id]/cancel-subscription)
 *     which passes the live `@/lib/stripe` + `@/lib/prisma`, and
 *   - the Layer 1 one-shot operator script (scripts/cancel-customer-subscription.ts)
 *     which can import this and pass its own `new PrismaClient()` + live key.
 *
 * Behaviour mirrors the Layer 1 script exactly — preview is read-only;
 * execute refunds only the un-refunded portion of succeeded charges,
 * cancels the subscription immediately, waits briefly for the
 * `customer.subscription.deleted` webhook to clean the DB, and manually
 * reconciles the row if the webhook hasn't landed.
 */
import type Stripe from "stripe";
import type { PrismaClient } from "@prisma/client";

// ── Preview shapes (serializable — safe to return from the route) ──────────
export type ChargeSummary = {
  id: string;
  amountCents: number;
  currency: string;
  status: string;
  refundedCents: number;
  refundableCents: number;
  createdAt: string; // ISO
};

export type SubscriptionSummary = {
  id: string;
  status: string;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  latestInvoiceStatus: string | null;
} | null;

export type CancelPreview = {
  subscription: SubscriptionSummary;
  /** True if a subscriptionId was supplied but Stripe couldn't retrieve it. */
  subscriptionMissing: boolean;
  charges: ChargeSummary[];
  refundableCents: number;
  refundableCount: number;
  totalCollectedCents: number;
  currency: string;
};

// ── Execute shapes ─────────────────────────────────────────────────────────
export type RefundResult = {
  chargeId: string;
  refundId: string;
  amountCents: number;
  currency: string;
  status: string | null;
};

export type CancelResult = {
  refunds: RefundResult[];
  totalRefundedCents: number;
  canceledStatus: string | null;
  cancelError: string | null;
  dbVia: "webhook" | "manual";
  finalStatus: string | null;
  finalSubscriptionId: string | null;
};

type Target = {
  customerId: string;
  subscriptionId: string | null;
};

/**
 * Read-only inspection: the live subscription state + every charge for the
 * customer + how much is refundable right now. No writes, no money moved.
 */
export async function previewCancel(
  stripe: Stripe,
  { customerId, subscriptionId }: Target
): Promise<CancelPreview> {
  let subscription: SubscriptionSummary = null;
  let subscriptionMissing = false;

  if (subscriptionId) {
    try {
      const sub = await stripe.subscriptions.retrieve(subscriptionId, {
        expand: ["latest_invoice"],
      });
      const inv = sub.latest_invoice;
      const latestInvoiceStatus =
        inv && typeof inv !== "string" ? inv.status : null;
      subscription = {
        id: sub.id,
        status: sub.status,
        currentPeriodStart: sub.current_period_start
          ? new Date(sub.current_period_start * 1000).toISOString()
          : null,
        currentPeriodEnd: sub.current_period_end
          ? new Date(sub.current_period_end * 1000).toISOString()
          : null,
        cancelAtPeriodEnd: sub.cancel_at_period_end,
        latestInvoiceStatus,
      };
    } catch {
      // It may already be canceled/deleted on Stripe.
      subscriptionMissing = true;
    }
  }

  const charges = await stripe.charges.list({ customer: customerId, limit: 100 });

  let totalCollectedCents = 0;
  let refundableCents = 0;
  let refundableCount = 0;
  const currency = charges.data[0]?.currency ?? "usd";

  const chargeSummaries: ChargeSummary[] = charges.data.map((c) => {
    const refundable = c.status === "succeeded" ? c.amount - c.amount_refunded : 0;
    if (c.status === "succeeded") totalCollectedCents += refundable;
    if (refundable > 0) {
      refundableCents += refundable;
      refundableCount += 1;
    }
    return {
      id: c.id,
      amountCents: c.amount,
      currency: c.currency,
      status: c.status,
      refundedCents: c.amount_refunded,
      refundableCents: refundable,
      createdAt: new Date(c.created * 1000).toISOString(),
    };
  });

  return {
    subscription,
    subscriptionMissing,
    charges: chargeSummaries,
    refundableCents,
    refundableCount,
    totalCollectedCents,
    currency,
  };
}

/**
 * Destructive: refund every refundable charge, cancel the subscription
 * immediately, then reconcile the DB. Idempotent — only the un-refunded
 * portion of succeeded charges is refunded, and an already-canceled sub is
 * tolerated. The caller is responsible for auth, eligibility, and audit.
 */
export async function executeCancelAndRefund(
  stripe: Stripe,
  prisma: PrismaClient,
  { userId, customerId, subscriptionId }: Target & { userId: string },
  opts: { webhookWaitMs?: number } = {}
): Promise<CancelResult> {
  const webhookWaitMs = opts.webhookWaitMs ?? 5000;

  // 1. Refund the refundable portion of each succeeded charge.
  const charges = await stripe.charges.list({ customer: customerId, limit: 100 });
  const refundable = charges.data.filter(
    (c) => c.status === "succeeded" && c.amount - c.amount_refunded > 0
  );

  const refunds: RefundResult[] = [];
  for (const c of refundable) {
    const r = await stripe.refunds.create({
      charge: c.id,
      reason: "requested_by_customer",
    });
    refunds.push({
      chargeId: c.id,
      refundId: r.id,
      amountCents: r.amount,
      currency: r.currency,
      status: r.status,
    });
  }
  const totalRefundedCents = refunds.reduce((s, r) => s + r.amountCents, 0);

  // 2. Cancel the subscription immediately (not cancel_at_period_end).
  let canceledStatus: string | null = null;
  let cancelError: string | null = null;
  if (subscriptionId) {
    try {
      const canceled = await stripe.subscriptions.cancel(subscriptionId);
      canceledStatus = canceled.status;
    } catch (err) {
      cancelError = err instanceof Error ? err.message : String(err);
    }
  }

  // 3. Wait for the customer.subscription.deleted webhook to clean the DB,
  //    then verify. If it hasn't landed, reconcile manually (same fields the
  //    subscription.deleted handler clears).
  if (webhookWaitMs > 0) {
    await new Promise((r) => setTimeout(r, webhookWaitMs));
  }

  let after = await prisma.user.findUnique({
    where: { id: userId },
    select: { subscriptionStatus: true, stripeSubscriptionId: true },
  });

  let dbVia: "webhook" | "manual" = "webhook";
  if (
    after &&
    (after.subscriptionStatus !== "FREE" || after.stripeSubscriptionId !== null)
  ) {
    await prisma.user.update({
      where: { id: userId },
      data: {
        subscriptionStatus: "FREE",
        stripeSubscriptionId: null,
        stripeCurrentPeriodEnd: null,
        stripeFirstFailureAt: null,
      },
    });
    dbVia = "manual";
    after = await prisma.user.findUnique({
      where: { id: userId },
      select: { subscriptionStatus: true, stripeSubscriptionId: true },
    });
  }

  return {
    refunds,
    totalRefundedCents,
    canceledStatus,
    cancelError,
    dbVia,
    finalStatus: after?.subscriptionStatus ?? null,
    finalSubscriptionId: after?.stripeSubscriptionId ?? null,
  };
}
