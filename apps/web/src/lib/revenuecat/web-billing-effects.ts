import "server-only";

/**
 * RevenueCat Web Billing — business side effects of a new web subscription.
 *
 * Web checkout used to be Stripe Checkout, and every "someone just
 * subscribed on the web" side effect hangs off the Stripe webhook's
 * `checkout.session.completed` / `invoice.payment_succeeded` cases. RevenueCat
 * Web Billing purchases never produce those Stripe events (RevenueCat runs
 * the subscription itself, not Stripe Billing), so the same effects are
 * driven from the RevenueCat webhook instead — this module. Kept field-for-
 * field equivalent to the Stripe webhook so dashboards don't shift:
 *
 *   INITIAL_PURCHASE (store RC_BILLING)
 *     · PostHog `subscription_started`
 *     · Meta CAPI `Purchase` (with the funnel fbclid)      — production only
 *     · founder payment notification
 *     · referral conversion                                — production only
 *     · server `funnel_payment_completed` "<plan>:first_payment"
 *     · trial → schedule the day-4 trial reminder email (RevenueCat's own
 *       "upcoming trial expiry" email only covers trials over a month)
 *   RENEWAL (store RC_BILLING)
 *     · server `funnel_payment_completed` "<plan>:renewal"
 *
 * NOT replicated, on purpose: payment-failed / receipt emails — RevenueCat
 * Web Billing sends its own lifecycle emails (initial purchase, renewal,
 * failed payment, cancellation…), so ours would be duplicates.
 *
 * Every effect is best-effort and isolated: one failing never blocks the
 * others or the webhook's 200.
 */

import type { RcWebhookEvent } from "@/lib/revenuecat/webhook-events";
import { WEB_OFFERINGS } from "@/lib/revenuecat/web-billing";
import { safeLog } from "@/lib/safe-log";

export type RcWebBillingEffect = "new_subscription" | "renewal" | null;

/** Which side effects (if any) this RC event should trigger. PURE. */
export function rcWebBillingEffectFor(event: RcWebhookEvent): RcWebBillingEffect {
  if ((event.store ?? "").trim().toUpperCase() !== "RC_BILLING") return null;
  const type = (event.type ?? "").trim().toUpperCase();
  if (type === "INITIAL_PURCHASE") return "new_subscription";
  if (type === "RENEWAL") return "renewal";
  return null;
}

/** "monthly" | "yearly" from our RC Web Billing product ids. PURE. */
export function rcWebInterval(productId: string | null | undefined): "monthly" | "yearly" {
  return /annual|year/i.test(productId ?? "") ? "yearly" : "monthly";
}

/**
 * Founder-notification source label. Prefers the `surface` metadata our
 * checkout attaches (web-billing-client.ts), then the offering: the funnel
 * uses `default`, /upgrade uses `web_upgrade*`. PURE.
 */
export function rcWebPurchaseSource(
  presentedOfferingId: string | null | undefined,
  surface?: string | null
): string {
  if (surface === "funnel") return "onboarding_funnel";
  if (surface === "upgrade") return "in_app_upgrade";
  // Bought outside goripple.io's checkout, linked at redemption (webhook
  // PURCHASE_REDEEMED → redemptionEffectEvent).
  if (surface === "rc_funnel") return "rc_funnel";
  if (surface === "redemption") return "web_redemption";
  if (presentedOfferingId === WEB_OFFERINGS.funnel) return "onboarding_funnel";
  if (
    presentedOfferingId === WEB_OFFERINGS.upgrade ||
    presentedOfferingId === WEB_OFFERINGS.upgradeLegacy
  ) {
    return "in_app_upgrade";
  }
  return "direct";
}

export async function runRcWebBillingEffects(
  event: RcWebhookEvent,
  userId: string
): Promise<void> {
  const effect = rcWebBillingEffectFor(event);
  if (!effect) return;

  const interval = rcWebInterval(event.product_id);
  const plan = interval === "yearly" ? "annual" : "monthly";
  const sandbox = (event.environment ?? "").toUpperCase() === "SANDBOX";
  const { prisma } = await import("@/lib/prisma");
  const { logServerFunnelEvent } = await import("@/lib/billing/server-funnel-event");

  if (effect === "renewal") {
    await logServerFunnelEvent(prisma, {
      userId,
      event: "funnel_payment_completed",
      value: `${plan}:renewal`,
      context: "revenuecat.RENEWAL",
    });
    return;
  }

  // ── new_subscription ──
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { createdAt: true, trialEndsAt: true, email: true, name: true },
  });
  if (!user) return;

  const source = rcWebPurchaseSource(event.presented_offering_id, event.metadata?.surface ?? null);

  try {
    const { track } = await import("@/lib/posthog");
    const now = Date.now();
    await track(userId, "subscription_started", {
      daysSinceSignup: Math.floor((now - user.createdAt.getTime()) / 86_400_000),
      daysIntoTrial: user.trialEndsAt
        ? Math.floor((now - (user.trialEndsAt.getTime() - 14 * 86_400_000)) / 86_400_000)
        : null,
      email: user.email,
      source,
      billing: "rc_billing",
      sandbox,
    });
  } catch (err) {
    safeLog.warn("revenuecat.effects.subscription-started-failed", { err: msg(err) });
  }

  // Meta CAPI only for goripple.io's own checkout. A purchase made on a
  // RevenueCat Purchase Link / Funnel page and redeemed later has no
  // goripple.io ad click behind it, and a RevenueCat-side ad integration
  // could already have reported it — sending ours risks double-counting.
  const offSiteCheckout = isOffSiteCheckout(event.metadata?.surface ?? null);

  if (!sandbox && !offSiteCheckout) {
    try {
      const { generateEventId, sendConversionEvent } = await import("@/lib/meta-capi");
      const { planValueDollars } = await import("@/lib/pricing");
      const clickRow = await prisma.onboardingEvent.findFirst({
        where: { userId, fbclid: { not: null } },
        orderBy: { createdAt: "desc" },
        select: { fbclid: true },
      });
      await sendConversionEvent({
        eventName: "Purchase",
        eventId: generateEventId("Purchase"),
        userId,
        eventSourceUrl: "https://goripple.io/start",
        userData: {
          email: user.email ?? undefined,
          fbclid: clickRow?.fbclid ?? undefined,
        },
        customData: {
          currency: "USD",
          value: planValueDollars(interval),
          content_name: `Ripple Pro ${interval}`,
          content_type: "product",
          content_ids: [event.product_id ?? "rc_billing"],
        },
      }).catch(() => {});
    } catch (err) {
      safeLog.warn("revenuecat.effects.meta-capi-failed", { err: msg(err) });
    }
  }

  try {
    const { notifyFoundersOfPayment } = await import("@/lib/founder-notifications");
    await notifyFoundersOfPayment({
      userId,
      email: `${user.email ?? "unknown"}${sandbox ? " (SANDBOX test)" : ""}`,
      plan: interval,
      source,
      timestamp: new Date(),
    });
  } catch (err) {
    safeLog.warn("revenuecat.effects.founder-notify-failed", { err: msg(err) });
  }

  if (!sandbox) {
    try {
      const { recordReferralConversion } = await import("@/lib/referrals");
      await recordReferralConversion(userId);
    } catch (err) {
      safeLog.warn("revenuecat.effects.referral-failed", { err: msg(err) });
    }
  }

  await logServerFunnelEvent(prisma, {
    userId,
    event: "funnel_payment_completed",
    value: `${plan}:first_payment`,
    context: "revenuecat.INITIAL_PURCHASE",
  });

  // Card trial → day-4 reminder ("Day 4: we email you a reminder" is a
  // funnel promise). Stripe sent trial_will_end 3 days before the end; we
  // schedule the same moment and re-check RevenueCat before sending.
  const isTrial = (event.period_type ?? "").toUpperCase() === "TRIAL";
  if (isTrial && typeof event.expiration_at_ms === "number") {
    try {
      const { inngest } = await import("@/inngest/client");
      await inngest.send({
        name: "billing/rc-trial-reminder.requested",
        // Same purchase → same id → Inngest drops a duplicate send.
        id: `rc-trial-reminder-${event.id ?? `${userId}-${event.expiration_at_ms}`}`,
        data: {
          userId,
          trialEndMs: event.expiration_at_ms,
          productId: event.product_id ?? null,
        },
      });
    } catch (err) {
      safeLog.warn("revenuecat.effects.trial-reminder-schedule-failed", { err: msg(err) });
    }
  }
}

/** Purchase checked out off goripple.io (RC Purchase Link / Funnel). PURE. */
export function isOffSiteCheckout(surface: string | null | undefined): boolean {
  return surface === "rc_funnel" || surface === "redemption";
}

function msg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
