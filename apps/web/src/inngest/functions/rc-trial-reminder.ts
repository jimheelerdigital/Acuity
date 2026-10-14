/**
 * Day-4 trial reminder for RevenueCat Web Billing card trials.
 *
 * Stripe trials get this email from `customer.subscription.trial_will_end`
 * (3 days before the trial ends). RevenueCat Web Billing has no equivalent
 * event, and its own "upcoming free trial expiry" email only covers trials
 * longer than a month — our trial is 7 days. So the RC webhook
 * (lib/revenuecat/web-billing-effects.ts) sends
 * `billing/rc-trial-reminder.requested` on a trial INITIAL_PURCHASE and this
 * function sleeps until 3 days before the trial ends.
 *
 * Before sending it re-reads RevenueCat: no email if the customer already
 * cancelled (unsubscribe detected), already converted, or lost access.
 */

import { inngest } from "@/inngest/client";

const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;

export const rcTrialReminderFn = inngest.createFunction(
  {
    id: "rc-trial-reminder",
    name: "RevenueCat Web Billing trial reminder (3 days before end)",
    triggers: [{ event: "billing/rc-trial-reminder.requested" }],
    retries: 2,
  },
  async ({ event, step }) => {
    const { userId, trialEndMs, productId } = event.data as {
      userId: string;
      trialEndMs: number;
      productId: string | null;
    };
    if (!userId || typeof trialEndMs !== "number") return { skipped: "bad-payload" };

    const remindAt = trialEndMs - THREE_DAYS_MS;
    if (remindAt > Date.now()) {
      await step.sleepUntil("wait-until-3-days-before-end", new Date(remindAt));
    }

    return step.run("check-and-send", async () => {
      if (Date.now() >= trialEndMs) return { skipped: "trial-already-ended" };

      const { fetchRcSubscriber } = await import("@/lib/revenuecat/client");
      const rc = await fetchRcSubscriber(userId);
      if (!rc.ok) return { skipped: `rc-unreadable:${rc.code}` };

      // The subscription for this purchase must still be a live, renewing trial.
      const subs = rc.subscriber.subscriptions ?? {};
      const sub = productId ? subs[productId] : undefined;
      if (!sub) return { skipped: "subscription-not-found" };
      if ((sub.period_type ?? "").toLowerCase() !== "trial") return { skipped: "not-trialing" };
      if (sub.unsubscribe_detected_at) return { skipped: "already-cancelled" };
      const exp = sub.expires_date ? Date.parse(sub.expires_date) : NaN;
      if (!Number.isFinite(exp) || exp <= Date.now()) return { skipped: "expired" };

      const { prisma } = await import("@/lib/prisma");
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { email: true, name: true },
      });
      if (!user?.email) return { skipped: "no-email" };

      const { displayAnnual, displayMonthly } = await import("@/lib/pricing");
      const yearly = /annual|year/i.test(productId ?? "");
      const priceText = yearly ? `${displayAnnual()}/year` : `${displayMonthly()}/month`;

      const { sendTrialReminderEmail } = await import("@/emails/trial-reminder");
      await sendTrialReminderEmail({
        to: user.email,
        name: user.name,
        trialEnd: new Date(exp),
        priceText,
      });
      return { sent: true };
    });
  }
);
