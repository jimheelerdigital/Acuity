import { headers } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";

import { stripe } from "@/lib/stripe";
import { safeLog } from "@/lib/safe-log";
import {
  sendConversionEvent,
  generateEventId,
} from "@/lib/meta-capi";

export const dynamic = "force-dynamic";
// Explicit Node.js runtime. Stripe signature verification requires the
// raw request body (Buffer / bytes-faithful string). The Edge runtime
// can mangle that via its body-parsing layer; pinning Node here means
// a future Next.js / Vercel default flip can't silently break us.
// 2026-06-01: webhook silent-fail diagnosis hardening.
export const runtime = "nodejs";

/**
 * Stripe webhook dispatcher.
 *
 * Verifies signature, short-circuits on seen event ids (StripeEvent
 * model — Stripe retries at-least-once), and routes to per-event
 * handlers. Each handler is idempotent on its own so a surprise
 * re-delivery after the StripeEvent write succeeded is still safe.
 *
 * 2026-06-01 hardening (38-day silence diagnosis):
 *   - Top-of-handler log fires BEFORE signature verification so
 *     Vercel logs prove Stripe is even reaching this code path.
 *   - safeLog (Sentry-routing) replaces silent `break`s on
 *     unhandled-event / missing-metadata paths so a future
 *     misconfiguration surfaces in observability instead of
 *     vanishing into a 200 OK.
 *   - The User update inside each handler is wrapped in try/catch
 *     with safeLog.error so a Prisma failure surfaces explicitly
 *     instead of bubbling to Next.js's 500 + Stripe's retry +
 *     eventual give-up.
 */

/**
 * Root rule (2026-07-07 recovery-bug fix): any transition into an
 * active/paid Stripe state MUST leave the app user PRO, reliably — even
 * when the customer was never linked (checkout.session.completed missed /
 * threw / lacked metadata.userId) and even when a prior failed payment
 * downgraded the user to FREE (dunning). A genuinely canceled subscription
 * is still never resurrected.
 */
type WebhookDb = (typeof import("@/lib/prisma"))["prisma"];

// A paid/active signal may upgrade a row to PRO when it is NOT FREE, OR when
// it is FREE but still inside a dunning window (stripeFirstFailureAt set by
// invoice.payment_failed's no-grace downgrade). A cleanly canceled row
// (FREE, anchor cleared by subscription.deleted / a clean cancel) is
// excluded — preserving the W-A audit's "never resurrect a canceled user"
// guard while unblocking legitimate dunning recovery (Bug B).
function recoverableOr() {
  return [
    { subscriptionStatus: { not: "FREE" } },
    { stripeFirstFailureAt: { not: null } },
  ];
}

function proRecoveryWhere(customerId: string) {
  return { stripeCustomerId: customerId, OR: recoverableOr() };
}

/**
 * Fallback (Bug A) for a PRO-granting event whose updateMany by
 * stripeCustomerId matched 0 rows — the customer link was never written.
 * Resolves the app user by, in order: (1) stripeSubscriptionId, (2) the
 * Stripe customer's email (unlinked rows only, so we never steal a row that
 * belongs to a different customer), (3) metadata.userId (event- then
 * customer-supplied) — and back-fills stripeCustomerId + stripeSubscriptionId
 * while granting PRO. Only ever invoked from active/paid contexts, so the PRO
 * grant is always correct; the recoverableOr()/unlinked guards still stop it
 * resurrecting a cleanly-canceled row. Returns true on link+upgrade.
 */
async function relinkAndGrantPro(
  db: WebhookDb,
  opts: {
    customerId: string;
    subscriptionId: string | null;
    periodEnd: Date | null;
    metadataUserId?: string | null;
    context: string;
  }
): Promise<boolean> {
  const { customerId, subscriptionId, periodEnd, metadataUserId, context } =
    opts;
  const data = {
    subscriptionStatus: "PRO",
    subscriptionSource: "stripe",
    stripeCustomerId: customerId,
    stripeFirstFailureAt: null,
    ...(subscriptionId ? { stripeSubscriptionId: subscriptionId } : {}),
    ...(periodEnd ? { stripeCurrentPeriodEnd: periodEnd } : {}),
  };

  // 1. by subscription id (recoverable rows only — never resurrect a cancel)
  if (subscriptionId) {
    const bySub = await db.user.updateMany({
      where: { stripeSubscriptionId: subscriptionId, OR: recoverableOr() },
      data,
    });
    if (bySub.count > 0) {
      safeLog.warn("stripe-webhook.relinked-by-subscription-id", {
        context,
        customerId,
        subscriptionId,
      });
      return true;
    }
  }

  // Pull email + metadata.userId off the Stripe customer for steps 2 & 3.
  let email: string | null = null;
  let customerMetaUserId: string | null = null;
  try {
    const customer = await stripe.customers.retrieve(customerId);
    if (!("deleted" in customer && customer.deleted)) {
      email = (customer as Stripe.Customer).email ?? null;
      customerMetaUserId =
        (customer as Stripe.Customer).metadata?.userId ?? null;
    }
  } catch (err) {
    safeLog.warn("stripe-webhook.relink-customer-retrieve-failed", {
      context,
      customerId,
      err: err instanceof Error ? err.message : String(err),
    });
  }

  // 2. by email — only rows not already linked to a customer.
  if (email) {
    const byEmail = await db.user.updateMany({
      where: { email, stripeCustomerId: null },
      data,
    });
    if (byEmail.count > 0) {
      safeLog.warn("stripe-webhook.relinked-by-email", { context, customerId });
      return true;
    }
  }

  // 3. by metadata.userId (authoritative app id) — recoverable rows only.
  const userId = metadataUserId ?? customerMetaUserId;
  if (userId) {
    const byId = await db.user.updateMany({
      where: { id: userId, OR: recoverableOr() },
      data,
    });
    if (byId.count > 0) {
      safeLog.warn("stripe-webhook.relinked-by-metadata-user-id", {
        context,
        customerId,
        userId,
      });
      return true;
    }
  }

  return false;
}

/**
 * Shared handler for customer.subscription.created and .updated. Maps
 * Stripe's status onto our vocab (active/trialing → PRO; past_due / unpaid /
 * canceled / incomplete_expired → FREE; incomplete → leave alone until the
 * first charge confirms) and applies it. The PRO direction uses
 * proRecoveryWhere + the relink fallback so an unlinked or in-dunning user is
 * reliably upgraded.
 */
async function applySubscriptionState(
  db: WebhookDb,
  sub: Stripe.Subscription,
  context: string
): Promise<void> {
  const customerId = sub.customer as string;
  if (!customerId) {
    safeLog.warn("stripe-webhook.sub-missing-customer", {
      context,
      subscriptionId: sub.id,
    });
    return;
  }

  const status = sub.status;
  const periodEnd = sub.current_period_end
    ? new Date(sub.current_period_end * 1000)
    : null;

  let nextStatus: "PRO" | "FREE" | null = null;
  if (status === "active" || status === "trialing") nextStatus = "PRO";
  else if (
    status === "past_due" ||
    status === "unpaid" ||
    status === "canceled" ||
    status === "incomplete_expired"
  )
    nextStatus = "FREE";
  // "incomplete" (first charge pending) → null: don't grant PRO yet and don't
  // downgrade; invoice.payment_succeeded / a later update flips it to PRO.

  if (nextStatus === "PRO") {
    try {
      const result = await db.user.updateMany({
        where: proRecoveryWhere(customerId),
        data: {
          subscriptionStatus: "PRO",
          subscriptionSource: "stripe",
          stripeSubscriptionId: sub.id,
          stripeFirstFailureAt: null,
          ...(periodEnd ? { stripeCurrentPeriodEnd: periodEnd } : {}),
        },
      });
      if (result.count === 0) {
        const relinked = await relinkAndGrantPro(db, {
          customerId,
          subscriptionId: sub.id,
          periodEnd,
          metadataUserId: sub.metadata?.userId ?? null,
          context,
        });
        if (!relinked) {
          safeLog.error(
            "stripe-webhook.active-sub-no-user-found",
            new Error("active subscription matched 0 users; relink failed"),
            {
              context,
              customerId,
              subscriptionId: sub.id,
              stripeStatus: status,
            }
          );
        }
      }
    } catch (err) {
      safeLog.error("stripe-webhook.sub-updated-update-failed", err, {
        context,
        customerId,
        subscriptionId: sub.id,
      });
    }
  } else if (nextStatus === "FREE") {
    // Terminal/at-risk direction. Unguarded by design (FREE is a safe
    // terminal write) and no relink fallback (downgrading a user we can't
    // find is a correct no-op). Leaves stripeFirstFailureAt untouched so a
    // failed-renewal recovery banner's window survives.
    try {
      await db.user.updateMany({
        where: { stripeCustomerId: customerId },
        data: {
          subscriptionStatus: "FREE",
          subscriptionSource: "stripe",
          stripeSubscriptionId: sub.id,
          ...(periodEnd ? { stripeCurrentPeriodEnd: periodEnd } : {}),
        },
      });
    } catch (err) {
      safeLog.error("stripe-webhook.sub-updated-update-failed", err, {
        context,
        customerId,
        subscriptionId: sub.id,
      });
    }
  } else {
    safeLog.info("stripe-webhook.sub-unmapped-status", {
      context,
      customerId,
      subscriptionId: sub.id,
      stripeStatus: status,
    });
  }
}

/**
 * Server-side funnel telemetry (2026-07-10, Task 1 — restore payment tracking).
 *
 * `funnel_payment_completed` used to be fired client-side, but the 2026-06-02
 * account-first funnel restructure dropped it, so payment telemetry went to
 * ZERO even though Stripe kept collecting money. We now fire it from the
 * webhook, which is the only place that observes a real charge.
 *
 * The admin funnel analytics (api/admin/metrics getFunnelAnalytics) only reads
 * OnboardingEvent rows where `sessionToken IS NOT NULL`, groups by sessionToken,
 * and filters by flowVersion. So a server-fired conversion is only visible if
 * it carries the SAME sessionToken + flowVersion as the user's original funnel
 * session. We resolve those from the user's most recent funnel_* event and
 * copy the attribution columns forward so the conversion attributes to the same
 * ad as the rest of the session.
 */
type FunnelContext = {
  sessionToken: string | null;
  flowVersion: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmContent: string | null;
  utmTerm: string | null;
  fbclid: string | null;
};

async function resolveFunnelContext(
  db: WebhookDb,
  userId: string
): Promise<FunnelContext | null> {
  return db.onboardingEvent.findFirst({
    where: {
      userId,
      event: { startsWith: "funnel_" },
      sessionToken: { not: null },
    },
    orderBy: { createdAt: "desc" },
    select: {
      sessionToken: true,
      flowVersion: true,
      utmSource: true,
      utmMedium: true,
      utmCampaign: true,
      utmContent: true,
      utmTerm: true,
      fbclid: true,
    },
  });
}

/**
 * Write a server-side funnel OnboardingEvent for `userId`, inheriting the
 * session token / flowVersion / attribution of that user's original funnel
 * session so it lands in admin funnel analytics under the same session. If the
 * user has no funnel session (e.g. a subscription created outside the funnel),
 * the row is still written with userId so it shows in the user's history, but
 * with a null sessionToken (invisible to the session-grouped funnel view) —
 * logged so we can see how often that happens.
 */
async function logServerFunnelEvent(
  db: WebhookDb,
  opts: { userId: string; event: string; value: string; context: string }
): Promise<void> {
  const { userId, event, value, context } = opts;
  try {
    const ctx = await resolveFunnelContext(db, userId);
    await db.onboardingEvent.create({
      data: {
        userId,
        sessionToken: ctx?.sessionToken ?? null,
        event,
        value,
        flowVersion: ctx?.flowVersion ?? null,
        utmSource: ctx?.utmSource ?? null,
        utmMedium: ctx?.utmMedium ?? null,
        utmCampaign: ctx?.utmCampaign ?? null,
        utmContent: ctx?.utmContent ?? null,
        utmTerm: ctx?.utmTerm ?? null,
        fbclid: ctx?.fbclid ?? null,
        isBot: false,
      },
    });
    if (!ctx?.sessionToken) {
      safeLog.info("stripe-webhook.funnel-event-no-session", {
        context,
        userId,
        event,
      });
    }
  } catch (err) {
    safeLog.warn("stripe-webhook.funnel-event-write-failed", {
      context,
      event,
      userId,
      err: err instanceof Error ? err.message : String(err),
    });
  }
}

/** Map a Stripe interval / checkout metadata interval to our plan label. */
function planLabel(interval: string | null | undefined): "annual" | "monthly" {
  return interval === "yearly" || interval === "year" ? "annual" : "monthly";
}

export async function POST(req: NextRequest) {
  // First line: prove the function is invoked. Independent of body,
  // signature, env. If Vercel logs don't show this for an event
  // Stripe Dashboard says was delivered, the route isn't reachable
  // (deployment / function-not-found / middleware redirect).
  safeLog.info("stripe-webhook.received", {
    ts: new Date().toISOString(),
  });

  const body = await req.text();
  const sig = headers().get("stripe-signature");

  if (!sig) {
    safeLog.warn("stripe-webhook.missing-signature-header", {
      bodyLength: body.length,
    });
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err) {
    // Log the SDK's diagnostic message server-side, but return an opaque
    // error to the caller. Surfacing the SDK message lets an attacker
    // tune signature-forgery attempts (e.g. "no signatures found
    // matching the expected signature for payload" vs "timestamp
    // outside the tolerance zone" tells them which guard to bypass
    // next).
    safeLog.error("stripe-webhook.signature-verification-failed", err, {
      hasSecret: Boolean(process.env.STRIPE_WEBHOOK_SECRET),
      secretLength: process.env.STRIPE_WEBHOOK_SECRET?.length ?? 0,
      bodyLength: body.length,
      sigPrefix: sig.slice(0, 16),
    });
    return NextResponse.json(
      { error: "Invalid webhook signature" },
      { status: 400 }
    );
  }

  safeLog.info("stripe-webhook.event", {
    id: event.id,
    type: event.type,
    livemode: event.livemode,
  });

  const { prisma } = await import("@/lib/prisma");

  // Idempotency guard — Stripe retries deliveries. If we've processed
  // this event.id before, ack with 200 and skip. The create happens at
  // the START (not end) of processing so a webhook that lands twice
  // in flight won't double-write; the second invocation throws on the
  // unique id, we catch and return 200.
  try {
    await prisma.stripeEvent.create({
      data: { id: event.id, type: event.type },
    });
  } catch (err) {
    // Unique violation (P2002) on StripeEvent.id means we've seen this.
    // Any other error — log + fall through (a StripeEvent write failure
    // shouldn't drop the actual payload handling).
    const code = (err as { code?: string } | null)?.code;
    if (code === "P2002") {
      safeLog.info("stripe-webhook.duplicate", { id: event.id });
      return NextResponse.json({ received: true, duplicate: true });
    }
    safeLog.error("stripe-webhook.stripe-event-write-failed", err, {
      id: event.id,
      type: event.type,
    });
    // Fall through to handling anyway.
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId = session.metadata?.userId;
      if (!userId) {
        // Was a silent `break` before 2026-06-01. Now surfaces so a
        // future checkout-creation path that forgets metadata.userId
        // is visible in Sentry the first time it hits production.
        safeLog.warn("stripe-webhook.checkout-session-missing-user-id", {
          sessionId: session.id,
          customerEmail: session.customer_email ?? null,
          customerId:
            typeof session.customer === "string" ? session.customer : null,
          hasMetadata: Boolean(session.metadata),
        });
        break;
      }

      let user: {
        createdAt: Date;
        trialEndsAt: Date | null;
        email: string | null;
      } | null = null;
      try {
        user = await prisma.user.update({
          where: { id: userId },
          data: {
            stripeCustomerId: session.customer as string,
            stripeSubscriptionId: session.subscription as string,
            subscriptionStatus: "PRO",
            subscriptionSource: "stripe",
          },
          select: { createdAt: true, trialEndsAt: true, email: true },
        });
      } catch (err) {
        // 2026-07-07 (Bug A §2): previously this swallowed the error and
        // 200-acked, which stranded the user unlinked forever — nothing
        // re-establishes the customer link on its own. Now we surface it
        // AND force a redelivery: delete the idempotency row written at the
        // top of POST (otherwise Stripe's retry is short-circuited as a
        // duplicate) and return 500 so Stripe redelivers. The relink
        // fallback on invoice/subscription events is the second safety net.
        safeLog.error("stripe-webhook.checkout-session-user-update-failed", err, {
          sessionId: session.id,
          userId,
          customerId:
            typeof session.customer === "string" ? session.customer : null,
        });
        try {
          await prisma.stripeEvent.delete({ where: { id: event.id } });
        } catch (delErr) {
          safeLog.warn("stripe-webhook.dedup-cleanup-failed", {
            id: event.id,
            err: delErr instanceof Error ? delErr.message : String(delErr),
          });
        }
        return NextResponse.json(
          { error: "checkout-session-user-update-failed" },
          { status: 500 }
        );
      }

      // Analytics event (IMPLEMENTATION_PLAN_PAYWALL §8.3). Days-since-
      // signup + days-into-trial are the retention signals we need to
      // tell good-trial-convert from bad-trial-convert later.
      try {
        const { track } = await import("@/lib/posthog");
        const now = Date.now();
        const daysSinceSignup = Math.floor(
          (now - user.createdAt.getTime()) / (24 * 60 * 60 * 1000)
        );
        const daysIntoTrial = user.trialEndsAt
          ? Math.floor(
              (now - (user.trialEndsAt.getTime() - 14 * 24 * 60 * 60 * 1000)) /
                (24 * 60 * 60 * 1000)
            )
          : null;
        await track(userId, "subscription_started", {
          daysSinceSignup,
          daysIntoTrial,
          email: user.email,
          source: session.metadata?.src ?? "direct",
        });
      } catch (err) {
        safeLog.warn("stripe-webhook.subscription-started-track-failed", {
          err: err instanceof Error ? err.message : String(err),
        });
      }

      // Fire Meta CAPI Purchase event (best-effort, non-blocking)
      try {
        const interval = session.metadata?.interval ?? "monthly";
        const purchaseValue = interval === "yearly" ? 39.99 : 4.99;
        const capiEventId = generateEventId("Purchase");
        sendConversionEvent({
          eventName: "Purchase",
          eventId: capiEventId,
          eventSourceUrl: "https://getacuity.io/start",
          userData: {
            email: user.email ?? undefined,
          },
          customData: {
            currency: "USD",
            value: purchaseValue,
            content_name: `Ripple Pro ${interval}`,
            content_type: "product",
            content_ids: [session.subscription as string],
          },
        }).catch(() => {});
      } catch (err) {
        safeLog.warn("stripe-webhook.meta-capi-purchase-failed", {
          err: err instanceof Error ? err.message : String(err),
        });
      }

      // Notify founders of new payment
      try {
        const { notifyFoundersOfPayment } = await import("@/lib/founder-notifications");
        await notifyFoundersOfPayment({
          userId,
          email: user.email ?? "unknown",
          plan: session.metadata?.interval ?? "monthly",
          source: session.metadata?.source ?? "direct",
          timestamp: new Date(),
        });
      } catch (err) {
        safeLog.warn("stripe-webhook.payment-notification-failed", {
          err: err instanceof Error ? err.message : String(err),
        });
      }

      // Fire referral conversion if this user was referred. Stub
      // reward-fulfillment logic — Jim decides the actual reward.
      try {
        const { recordReferralConversion } = await import("@/lib/referrals");
        await recordReferralConversion(userId);
      } catch (err) {
        safeLog.warn("stripe-webhook.referral-conversion-failed", {
          err: err instanceof Error ? err.message : String(err),
        });
      }

      // Task 1 — restore payment telemetry. This is the FIRST charge of a new
      // subscription (checkout just completed), so it's the funnel conversion.
      // value = "<plan>:first_payment" (e.g. "annual:first_payment"), attached
      // to the user's original funnel session so it appears as paid in admin.
      await logServerFunnelEvent(prisma, {
        userId,
        event: "funnel_payment_completed",
        value: `${planLabel(session.metadata?.interval)}:first_payment`,
        context: "checkout.session.completed",
      });
      break;
    }

    case "invoice.payment_succeeded": {
      const invoice = event.data.object as Stripe.Invoice;
      const customerId = invoice.customer as string;
      if (!customerId) {
        safeLog.warn("stripe-webhook.invoice-missing-customer", {
          invoiceId: invoice.id,
        });
        break;
      }

      const sub = invoice.subscription as string | null;
      const periodEnd = invoice.lines.data[0]?.period?.end
        ? new Date(invoice.lines.data[0].period.end * 1000)
        : null;

      // Recovery (Bug B fix, 2026-07-07): proRecoveryWhere upgrades to PRO
      // when the row is NOT FREE, OR when it is FREE-but-in-dunning
      // (stripeFirstFailureAt set). This IS the failed-then-recovered path:
      // invoice.payment_failed set the user FREE and stamped the failure
      // anchor; this success clears the anchor and restores PRO. A cleanly
      // canceled user (FREE, anchor cleared) is still never resurrected,
      // preserving the W-A audit guard.
      try {
        const result = await prisma.user.updateMany({
          where: proRecoveryWhere(customerId),
          data: {
            subscriptionStatus: "PRO",
            subscriptionSource: "stripe",
            stripeFirstFailureAt: null,
            ...(sub ? { stripeSubscriptionId: sub } : {}),
            ...(periodEnd ? { stripeCurrentPeriodEnd: periodEnd } : {}),
          },
        });
        if (result.count === 0) {
          // Bug A fix: 0 rows means the customer was never linked. Don't
          // no-op — resolve the user, back-fill the link, and grant PRO.
          const relinked = await relinkAndGrantPro(prisma, {
            customerId,
            subscriptionId: sub,
            periodEnd,
            context: "invoice.payment_succeeded",
          });
          if (!relinked) {
            safeLog.error(
              "stripe-webhook.invoice-success-no-user-found",
              new Error("paid invoice matched 0 users; relink failed"),
              { customerId, invoiceId: invoice.id }
            );
          }
        }
      } catch (err) {
        safeLog.error("stripe-webhook.invoice-success-update-failed", err, {
          customerId,
          invoiceId: invoice.id,
        });
      }

      // Task 1 — renewal telemetry. invoice.payment_succeeded fires for BOTH the
      // first charge (billing_reason "subscription_create", already tracked as
      // first_payment by checkout.session.completed) and recurring renewals
      // ("subscription_cycle"). Only emit here for renewals so we never
      // double-count the first payment.
      if (invoice.billing_reason === "subscription_cycle") {
        try {
          const payingUser = await prisma.user.findFirst({
            where: { stripeCustomerId: customerId },
            select: { id: true },
          });
          if (payingUser) {
            const interval = invoice.lines.data[0]?.price?.recurring?.interval ?? null;
            await logServerFunnelEvent(prisma, {
              userId: payingUser.id,
              event: "funnel_payment_completed",
              value: `${planLabel(interval)}:renewal`,
              context: "invoice.payment_succeeded.renewal",
            });
          }
        } catch (err) {
          safeLog.warn("stripe-webhook.renewal-telemetry-failed", {
            customerId,
            invoiceId: invoice.id,
            err: err instanceof Error ? err.message : String(err),
          });
        }
      }
      break;
    }

    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice;
      const customerId = invoice.customer as string;
      if (!customerId) {
        safeLog.warn("stripe-webhook.invoice-failed-missing-customer", {
          invoiceId: invoice.id,
        });
        break;
      }

      // No-grace downgrade (2026-06-12 spec): a failed charge sets the user
      // FREE immediately — there is NO PAST_DUE intermediate state. The
      // recovery banner is driven by stripeFirstFailureAt (stamped below),
      // not by status, and invoice.payment_succeeded / subscription active
      // lift the user back to PRO on recovery via that anchor (Bug B fix —
      // see proRecoveryWhere). Stripe's own retry schedule fires
      // invoice.payment_succeeded when the card is fixed.
      //
      // Status guard (W-A audit §4.4 fix, 2026-05-03): a late Stripe retry
      // for an old failed invoice must not drag a user who has since
      // canceled (FREE) back into a paying-but-failing state. The WHERE
      // filter blocks the write for already-FREE users so it's a no-op for
      // canceled accounts; we still 200-ack so Stripe stops retrying. The
      // findMany carries the same guard so we don't email a canceled user
      // about a card that's no longer on file.
      try {
        const users = await prisma.user.findMany({
          where: {
            stripeCustomerId: customerId,
            subscriptionStatus: { not: "FREE" },
          },
          select: { id: true, email: true, name: true },
        });
        // ORDER IS LOAD-BEARING (2026-07-09 fix): the anchor MUST be stamped
        // BEFORE the downgrade. Both statements filter on
        // `subscriptionStatus: { not: "FREE" }`; if the downgrade runs first it
        // sets the row FREE and thereby falsifies the anchor statement's own
        // WHERE, so stripeFirstFailureAt was never written. That silently broke
        // BOTH the recovery banner and proRecoveryWhere()'s
        // `stripeFirstFailureAt: { not: null }` disjunct — i.e. the entire
        // failed-then-recovered path (Bug B) could never fire. Regression
        // covered by route.test.ts "payment_failed drops PRO → FREE and stamps
        // stripeFirstFailureAt".
        //
        // Anchor the grace window at the FIRST failure only — set
        // stripeFirstFailureAt where it's still null so Stripe's subsequent
        // retry failures don't keep pushing the window out. Cleared on
        // recovery (payment_succeeded) or cancel. The `not: "FREE"` guard is
        // still true at this point, so a cleanly-canceled user is untouched.
        await prisma.user.updateMany({
          where: {
            stripeCustomerId: customerId,
            subscriptionStatus: { not: "FREE" },
            stripeFirstFailureAt: null,
          },
          data: { stripeFirstFailureAt: new Date() },
        });

        // No-grace downgrade. Runs second, now that the anchor is safely set.
        await prisma.user.updateMany({
          where: {
            stripeCustomerId: customerId,
            subscriptionStatus: { not: "FREE" },
          },
          data: { subscriptionStatus: "FREE" },
        });

        // Best-effort email nudge so the user knows to update their
        // payment method before Stripe's dunning period ends. Only
        // sent to users we actually downgraded — canceled users
        // were filtered out by the findMany above.
        try {
          const { sendPaymentFailedEmail } = await import("@/emails/payment-failed");
          for (const u of users) {
            if (u.email) await sendPaymentFailedEmail({ to: u.email, name: u.name });
          }
        } catch (err) {
          safeLog.warn("stripe-webhook.payment-failed-email-failed", {
            err: err instanceof Error ? err.message : String(err),
          });
        }

        // Task 2 — surface WHY the charge failed. Retrieve the failed
        // PaymentIntent to read Stripe's decline code (card_declined,
        // insufficient_funds, expired_card, …) and log it as a funnel event
        // per downgraded user so it's visible in admin instead of an opaque
        // "payment failed". Best-effort — never blocks the downgrade.
        try {
          const piId =
            typeof invoice.payment_intent === "string"
              ? invoice.payment_intent
              : invoice.payment_intent?.id ?? null;
          let declineCode = "unknown";
          if (piId) {
            const pi = await stripe.paymentIntents.retrieve(piId);
            declineCode =
              pi.last_payment_error?.decline_code ||
              pi.last_payment_error?.code ||
              "unknown";
          }
          for (const u of users) {
            await logServerFunnelEvent(prisma, {
              userId: u.id,
              event: "funnel_payment_failed",
              value: `decline:${declineCode}`,
              context: "invoice.payment_failed",
            });
          }
        } catch (err) {
          safeLog.warn("stripe-webhook.payment-failed-decline-log-failed", {
            customerId,
            invoiceId: invoice.id,
            err: err instanceof Error ? err.message : String(err),
          });
        }
      } catch (err) {
        safeLog.error("stripe-webhook.invoice-failed-update-failed", err, {
          customerId,
          invoiceId: invoice.id,
        });
      }
      break;
    }

    case "customer.subscription.created":
    case "customer.subscription.updated": {
      // Both handled the same way (applySubscriptionState): map Stripe's
      // status onto our vocab and apply it. Handling .created (added
      // 2026-07-07, Bug A) means a subscription that reaches active without
      // a corresponding checkout.session.completed still grants PRO — and
      // the PRO path relinks an unlinked or in-dunning user.
      const sub = event.data.object as Stripe.Subscription;
      await applySubscriptionState(prisma, sub, event.type);
      break;
    }

    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      try {
        await prisma.user.updateMany({
          where: { stripeCustomerId: sub.customer as string },
          data: {
            subscriptionStatus: "FREE",
            stripeSubscriptionId: null,
            stripeCurrentPeriodEnd: null,
            stripeFirstFailureAt: null,
          },
        });
      } catch (err) {
        safeLog.error("stripe-webhook.sub-deleted-update-failed", err, {
          customerId: sub.customer,
          subscriptionId: sub.id,
        });
      }
      break;
    }

    default:
      safeLog.info("stripe-webhook.unhandled-event-type", { type: event.type });
      break;
  }

  return NextResponse.json({ received: true });
}
