/**
 * Payment-failed notification email. Sent on Stripe
 * `invoice.payment_failed` webhook deliveries — the user's card got
 * declined and Stripe's retry schedule has started.
 *
 * ── What is true when this sends (2026-10-18 rewrite, audit R-2026-10-10-1) ──
 * The webhook sets the user FREE on the FIRST failure (no-grace spec,
 * stripe/webhook/route.ts). The old copy said "your account is still
 * active for now", which was the opposite of what the code had just done,
 * and linked to /api/stripe/manage, which bounces anyone not signed in on
 * the web to the sign-in page — funnel buyers live in the app. So:
 *
 *   - the copy says Pro is paused until the card goes through
 *   - the button is Stripe's hosted invoice page (no sign-in; pay the open
 *     invoice with a new card). /api/stripe/manage is the fallback only
 *     when Stripe gave us no hosted URL.
 *   - two variants: the first charge after the free trial (most of our
 *     declines — the 09-27 cohort was 5 of 9) and a renewal
 *
 * Follow-ups at +2d / +5d live in the recovery orchestrator
 * (emails/trial/payment-failed-followup.ts); this one is transactional
 * and goes out from the webhook itself.
 *
 * Copy rules: "debrief", no time-of-day words, no duration claims, no
 * therapy claims. Never say "still active" unless it is.
 */

import { sendEmailOrThrow } from "@/lib/resend";

import { emailLayout } from "./layout";

const EMAIL_FROM = process.env.EMAIL_FROM ?? "noreply@getacuity.io";

export interface PaymentFailedEmailInput {
  to: string;
  name: string | null;
  /** Stripe's hosted invoice page — pays the open invoice, no sign-in. */
  hostedInvoiceUrl?: string | null;
  /** invoice.amount_due in the smallest currency unit (cents). */
  amountDue?: number | null;
  /** invoice.currency, e.g. "usd". */
  currency?: string | null;
  /** True when this is the first charge after the free trial. */
  firstCharge?: boolean;
}

export function formatAmount(amountDue: number | null | undefined, currency: string | null | undefined): string | null {
  if (amountDue == null || !Number.isFinite(amountDue)) return null;
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: (currency ?? "usd").toUpperCase(),
    }).format(amountDue / 100);
  } catch {
    return `$${(amountDue / 100).toFixed(2)}`;
  }
}

/** Subject + body for a given situation. Exported so tests can pin copy. */
export function paymentFailedCopy(input: PaymentFailedEmailInput): {
  subject: string;
  title: string;
  preheader: string;
  intro: string;
  ctaLabel: string;
  ctaUrl: string;
  footnote: string;
} {
  const firstName = input.name?.trim().split(" ")[0] || "there";
  const amount = formatAmount(input.amountDue, input.currency);
  const ctaUrl = input.hostedInvoiceUrl || `${appUrl()}/api/stripe/manage`;
  const noSignIn = input.hostedInvoiceUrl ? " No sign-in needed." : "";

  if (input.firstCharge) {
    return {
      subject: "Your free week ended and your card didn't go through",
      title: "Your card didn't go through",
      preheader: "One tap fixes it. No sign-in needed.",
      intro: `Hi ${firstName} — your free week of Ripple Pro ended and the card on file was declined${amount ? ` for ${amount}` : ""}. Pro is paused until the payment goes through, so your debriefs are saved but the Pro features are off. One tap on the button below lets you pay with a different card.${noSignIn}`,
      ctaLabel: "Fix my payment",
      ctaUrl,
      footnote:
        "Stripe will also retry the card on file over the next few days, and Pro switches back on the moment a charge succeeds. If you'd rather not continue, you don't need to do anything.",
    };
  }

  return {
    subject: "Couldn't charge your card — Pro is paused",
    title: "Quick heads-up on your subscription",
    preheader: "Stripe couldn't charge your card. Pro is paused until it goes through.",
    intro: `Hi ${firstName} — Stripe couldn't charge your card for your Ripple Pro renewal${amount ? ` (${amount})` : ""}. Pro is paused until the payment goes through; your debriefs and everything Ripple has pulled out of them are safe. Updating the card or paying the open invoice below switches Pro back on right away.${noSignIn}`,
    ctaLabel: "Update payment",
    ctaUrl,
    footnote:
      "Stripe retries the card on file over the next couple of weeks and Pro comes back the moment a charge succeeds. Nothing is deleted while it's paused.",
  };
}

export async function sendPaymentFailedEmail(input: PaymentFailedEmailInput) {
  const c = paymentFailedCopy(input);
  const html = emailLayout({
    title: c.title,
    preheader: c.preheader,
    intro: c.intro,
    ctaLabel: c.ctaLabel,
    ctaUrl: c.ctaUrl,
    footnote: c.footnote,
  });

  await sendEmailOrThrow({
    from: EMAIL_FROM,
    to: input.to,
    subject: c.subject,
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
