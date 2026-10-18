/**
 * Failed-payment follow-ups, +2 days and +5 days (2026-10-18, audit
 * R-2026-10-10-1, per Keenan). The webhook sends the first notice the
 * moment a card is declined (emails/payment-failed.ts); these two go out
 * from the recovery orchestrator while Stripe is still retrying and the
 * invoice is still open. They stop by themselves: payment_succeeded and
 * cancel both clear User.stripeFirstFailureAt, and sendTrialEmail checks
 * Stripe for an open invoice before every send.
 *
 * Transactional, not marketing: a marketing unsubscribe does not silence
 * them (TRANSACTIONAL_EMAIL_KEYS in lib/trial-emails.ts), but they still
 * carry the footer link.
 *
 * The button is Stripe's hosted invoice page — pays the open invoice with
 * any card, no sign-in. Copy rules: "debrief", no time-of-day words, no
 * duration claims, no therapy claims, and never "still active".
 */
import { button, h1, hi, para, variant, withVariants } from "./kit";
import type { TrialEmailTemplate, TrialVars } from "./types";

function amountPhrase(v: TrialVars): string {
  return v.invoiceAmount ? ` for ${v.invoiceAmount}` : "";
}

function cta(v: TrialVars): string {
  return v.hostedInvoiceUrl || `${v.appUrl}/api/stripe/manage`;
}

function firstChargeIntro(v: TrialVars): string {
  return v.paymentFirstCharge
    ? `Your free week of Ripple Pro ended and the card on file didn&rsquo;t go through${amountPhrase(v)}.`
    : `The card on file for your Ripple Pro renewal didn&rsquo;t go through${amountPhrase(v)}.`;
}

export const paymentFailed2d: TrialEmailTemplate = withVariants([
  variant(
    "still_paused",
    "Two days in: Pro is paused, one tap fixes it, debriefs are safe",
    () => "Pro is still paused",
    () => "Your card didn't go through. One tap fixes it.",
    (v) => `
      ${h1("Pro is still paused.")}
      ${hi(v)}
      ${para(`${firstChargeIntro(v)} Pro stays paused until a payment goes through. Everything you&rsquo;ve debriefed is saved and waiting.`)}
      ${para(`Paying the open invoice with any card switches Pro back on right away.${v.hostedInvoiceUrl ? " No sign-in needed." : ""}`)}
      ${button(cta(v), "Fix my payment")}
    `
  ),
]);

export const paymentFailed5d: TrialEmailTemplate = withVariants([
  variant(
    "last_retries",
    "Five days in: Stripe's retries are running out, last clear chance",
    () => "Last chance to keep Ripple Pro",
    () => "Stripe is almost out of retries on your card.",
    (v) => `
      ${h1("Last chance to keep Pro.")}
      ${hi(v)}
      ${para(`${firstChargeIntro(v)} Stripe has been retrying the card and is nearly out of attempts. Once they end, Pro stays off until you pay the open invoice.`)}
      ${para(`Your debriefs and everything Ripple pulled out of them stay saved either way. If you&rsquo;d like to keep Pro, the button below does it with any card.${v.hostedInvoiceUrl ? " No sign-in needed." : ""}`)}
      ${button(cta(v), "Keep Ripple Pro")}
    `
  ),
]);
