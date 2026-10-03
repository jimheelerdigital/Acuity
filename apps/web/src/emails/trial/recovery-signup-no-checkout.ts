/**
 * Recovery Email 2 — Signed Up But No Checkout
 *
 * Trigger: web funnel account created (funnel_account_created, or legacy
 *          funnel_signup_completed), no funnel_checkout_started, not Pro.
 *          1–4 hours after signup.
 * Subject: "Your free week of Pro is still here"
 *
 * 2026-09-24: rewritten for the FREE-plan funnel. Funnel signups land on the
 * free plan; the 7-day trial needs a card. Links to /pro-trial, which sends
 * them to their funnel's paywall (the only place the card trial exists).
 * From: Keenan from Ripple <keenan@getacuity.io> (set centrally in sendTrialEmail)
 *
 * 2026-10-01: three versions, Jev picks (lib/email-jev.ts). Goal: she starts
 * the paid membership / card trial within 3 days. Same /pro-trial URL.
 */

import { escapeHtml } from "@/lib/escape-html";
import { displayPriceLine } from "@/lib/pricing";
import { button, exampleCard, h1, hi, men, para, variant, withVariants } from "./kit";
import type { TrialEmailTemplate, TrialVars } from "./types";

const PRICE = displayPriceLine();

function trialUrl(v: TrialVars): string {
  return `${escapeHtml(v.appUrl)}/pro-trial?utm_source=email&utm_medium=recovery&utm_campaign=signup_no_checkout`;
}

const TERMS = `The first 7 days are free. $0 today, we email you before you&rsquo;re charged, and you can cancel anytime from your account. After that it&rsquo;s ${PRICE}.`;

export const recoverySignupNoCheckout: TrialEmailTemplate = withVariants([
  variant(
    "free_week_waiting",
    "Her free week of Pro is still waiting; what Pro adds, and the no-risk terms",
    () => "Your free week of Pro is still here",
    () => "7 days of Pro, $0 today. We remind you before you're charged.",
    (v) => `
      ${h1("Your free week of Pro is still here.")}
      ${hi(v)}
      ${para("Your Ripple account is set up. What you haven&rsquo;t opened yet is Pro: it turns what you say into a to-do list, tracks the habits you&rsquo;re building, and shows you the patterns you can&rsquo;t see from inside your own week.")}
      ${para(TERMS)}
      ${button(trialUrl(v), "Start my free 7 days")}
    `
  ),
  variant(
    "show_what_pro_does",
    "Shows the say-it, get-the-list example so she sees Pro working before the offer",
    () => "What Pro does with one sentence",
    () => "You talk. Pro hands back your list and tracks your habits.",
    (v) => `
      ${h1("What Pro does with one sentence.")}
      ${hi(v)}
      ${exampleCard(v)}
      ${para("Do that through the week and Pro starts showing what keeps coming up, plus a weekly report on how it went.")}
      ${para(TERMS)}
      ${button(trialUrl(v), "Start my free 7 days")}
    `
  ),
  variant(
    "honest_note",
    "Short honest note from Keenan: try it free for a week, cancel easily if it's not for her",
    () => "try it for a week, on me",
    () => "If it doesn't earn its place in your week, cancel. No hard feelings.",
    (v) => `
      ${hi(v)}
      ${para("Keenan here, one of the founders of Ripple. You made an account but didn&rsquo;t start your free week of Pro, so here&rsquo;s the honest pitch.")}
      ${para(men(v) ? "Give it a week. Talk through what you&rsquo;re working on whenever it suits you, and see if having your list, your habits and your patterns in one place keeps you on track." : "Give it a week. Talk through what&rsquo;s on your plate whenever it suits you, and see if having your list, your habits and your patterns in one place takes some weight off.")}
      ${para(`If it doesn&rsquo;t earn its place, cancel from your account before day 7 and you pay nothing. We email you before you&rsquo;re charged. After that it&rsquo;s ${PRICE}.`)}
      ${button(trialUrl(v), "Start my free 7 days")}
    `
  ),
]);
