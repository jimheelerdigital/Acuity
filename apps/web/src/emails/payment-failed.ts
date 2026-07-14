/**
 * Payment-failed notification email. Sent on Stripe
 * `invoice.payment_failed` webhook deliveries — the user's card got
 * declined and Stripe's dunning period has started.
 *
 * Soft tone. No "your access has been cut off" panic. Stripe retries
 * for ~15 days; our job is to tell the user their card needs updating
 * so the retry succeeds. The CTA points at /api/stripe/manage, which
 * mints a fresh Stripe Billing Portal session on click and redirects
 * the user straight into Stripe to update their card — no intermediate
 * "sign in, then hit Manage subscription" hop.
 */

import { getResendClient } from "@/lib/resend";

import { emailLayout } from "./layout";

const EMAIL_FROM = process.env.EMAIL_FROM ?? "noreply@getacuity.io";

export async function sendPaymentFailedEmail({
  to,
  name,
}: {
  to: string;
  name: string | null;
}) {
  const resend = getResendClient();
  if (!resend) return;

  const firstName = name?.split(" ")[0] ?? "there";
  const portalUrl = `${appUrl()}/api/stripe/manage`;

  const html = emailLayout({
    title: "Quick heads-up on your subscription",
    preheader: "Stripe couldn't charge your card — a small fix keeps things running.",
    intro: `Hi ${firstName} — Stripe couldn't charge your card for this month's Ripple subscription. Your account is still active for now while Stripe retries, but updating your card keeps everything running smoothly.`,
    ctaLabel: "Update payment method",
    ctaUrl: portalUrl,
    footnote:
      "The button above takes you straight to Stripe to update your card. Stripe will retry over the next couple of weeks; nothing gets cut off without another email first.",
  });

  await resend.emails.send({
    from: EMAIL_FROM,
    to,
    subject: "Couldn't charge your card — quick update needed",
    html,
  });
}

function appUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.NEXTAUTH_URL ??
    "https://www.getacuity.io"
  );
}
