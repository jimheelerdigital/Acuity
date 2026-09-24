/**
 * Card-trial reminder. Sent on Stripe `customer.subscription.trial_will_end`,
 * which Stripe fires 3 days before a trial ends (day 4 of the 7-day web
 * trial). The funnel paywall promises this email ("Day 4: we email you a
 * reminder"), so it must keep firing. Stripe only sends the event if the
 * webhook endpoint is subscribed to it.
 *
 * Plain and specific: when the charge happens, how much, how to cancel.
 * The existing trial-ending email (emails/trial/trial-ending.ts) only goes
 * to users WITHOUT a card. This is its counterpart for card trials.
 */

import { sendEmailOrThrow } from "@/lib/resend";

import { emailLayout } from "./layout";

const EMAIL_FROM = process.env.EMAIL_FROM ?? "noreply@getacuity.io";

export async function sendTrialReminderEmail({
  to,
  name,
  trialEnd,
  priceText,
}: {
  to: string;
  name: string | null;
  trialEnd: Date;
  /** What Stripe will charge, e.g. "$9.99/month". */
  priceText: string;
}) {
  const firstName = name?.split(" ")[0] ?? "there";
  const when = trialEnd.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "America/Chicago",
  });
  const portalUrl = `${appUrl()}/api/stripe/manage`;

  const html = emailLayout({
    title: "Your free trial ends in 3 days",
    preheader: `Your Ripple Pro trial ends ${when}. Nothing to do if you want to keep it.`,
    intro: `Hi ${firstName}, a quick reminder: your free Ripple Pro trial ends on ${when}. After that, your card is charged ${priceText}. If you want to keep Pro, there's nothing to do. If not, cancel before then and you won't pay anything.`,
    ctaLabel: "Manage or cancel",
    ctaUrl: portalUrl,
    footnote:
      "The button opens your Stripe billing page, where you can cancel in a couple of taps. Your debriefs stay yours either way.",
  });

  await sendEmailOrThrow({
    from: EMAIL_FROM,
    to,
    subject: `Your Ripple trial ends ${when}`,
    html,
  });
}

function appUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.NEXTAUTH_URL ??
    "https://goripple.io"
  );
}
