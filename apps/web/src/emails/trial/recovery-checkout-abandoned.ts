/**
 * Recovery Email 1 — Checkout Abandoned
 *
 * Trigger: User has funnel_checkout_started but no active subscription.
 *          30 minutes after abandonment.
 * Subject: "You were almost there"
 * From: Keenan from Ripple <keenan@getacuity.io> (set centrally in sendTrialEmail)
 *
 * 2026-09-24: dropped the per-branch quiz line. TrialVars never carried the
 * branch, so every user got the "overload" line whatever they answered.
 * Links to /pro-trial (the funnel paywall, where the card trial lives).
 *
 * 2026-10-01: three versions, Jev picks (lib/email-jev.ts). Goal: she starts
 * the paid membership / card trial within 3 days. Same /pro-trial URL.
 */

import { escapeHtml } from "@/lib/escape-html";
import { button, h1, hi, men, para, variant, withVariants } from "./kit";
import type { TrialEmailTemplate, TrialVars } from "./types";

function trialUrl(v: TrialVars): string {
  return `${escapeHtml(v.appUrl)}/pro-trial?utm_source=email&utm_medium=recovery&utm_campaign=checkout_abandoned`;
}

export const recoveryCheckoutAbandoned: TrialEmailTemplate = withVariants([
  variant(
    "almost_there",
    "Personal note from Keenan: she stopped at checkout, the free week is still waiting, reply if it broke",
    () => "You were almost there",
    () => "Your free week of Pro is still waiting.",
    (v) => `
      ${h1("You were almost there.")}
      ${hi(v)}
      ${para("I&rsquo;m Keenan, one of the founders of Ripple. You got as far as checkout and stopped. That&rsquo;s fine. Maybe the timing was off, or you wanted to think it over.")}
      ${para("Your free week is still waiting. $0 today, we email you before you&rsquo;re charged, and you can cancel anytime from your account.")}
      ${button(trialUrl(v), "Start my free 7 days")}
      ${para("If something at checkout didn&rsquo;t work, reply and I&rsquo;ll sort it out myself.")}
    `
  ),
  variant(
    "nothing_today",
    "Leads with the risk-free terms: $0 today, reminder before any charge, cancel anytime",
    () => "$0 today, and a reminder before anything",
    () => "Start free. We email you before you're ever charged.",
    (v) => `
      ${h1("$0 today. A reminder before anything else.")}
      ${hi(v)}
      ${para("If the card step gave you pause, here&rsquo;s exactly how it works:")}
      ${para("&#10003; Nothing is charged today<br/>&#10003; We email you before your free week ends<br/>&#10003; Cancel from your account in two taps, any time")}
      ${para("You&rsquo;re one step from your free week.")}
      ${button(trialUrl(v), "Start my free 7 days")}
    `
  ),
  variant(
    "what_week_one_looks_like",
    "Paints her first week with Ripple: the list, the habits, the first weekly report",
    () => "Here's what your first week looks like",
    () => "A list that writes itself, habits tracked, and your first weekly report.",
    (v) => `
      ${h1("Here&rsquo;s what your first week looks like.")}
      ${hi(v)}
      ${para(men(v) ? "You talk through what you&rsquo;re working on, whenever it suits you. Ripple pulls out the tasks, tracks the habits you mention (gym, sleep, money), and by the end of the week shows you what kept coming up." : "You talk through what&rsquo;s on your plate, whenever it suits you. Ripple pulls out the tasks, tracks the habits you mention, and by the end of the week shows you what kept coming up.")}
      ${para("You stopped just before your free week started. It&rsquo;s still there: $0 today, cancel anytime.")}
      ${button(trialUrl(v), "Start my free 7 days")}
    `
  ),
]);
