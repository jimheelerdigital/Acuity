/**
 * Trial-Ending Email — "Your Ripple trial ends in 2 days"
 *
 * Trigger: Active trial user whose trialEndsAt is ~2 days away, has
 *          at least 1 completed recording, has NOT paid, and has no
 *          card/payment method on file (stripeCustomerId is null,
 *          stripeSubscriptionId is null, no Apple/Google IAP).
 * Subject: "Your Ripple trial ends in 2 days"
 * From: Keenan from Ripple <keenan@getacuity.io> (set centrally in sendTrialEmail)
 *
 * Fires once per user. Single CTA to /upgrade. Copy assumes the user
 * HAS recorded (never-recorded users are excluded at the orchestrator).
 *
 * 2026-10-01: three versions, Jev picks (lib/email-jev.ts). Goal: she starts
 * a paid membership within 3 days. Same /upgrade URL.
 */

import { escapeHtml } from "@/lib/escape-html";
import { displayPriceLine } from "@/lib/pricing";
import { button, h1, hi, para, variant, withVariants } from "./kit";
import type { TrialEmailTemplate, TrialVars } from "./types";

function upgradeUrl(v: TrialVars): string {
  return `${v.appUrl}/upgrade?src=trial_ending_email`;
}

function debriefs(v: TrialVars): string {
  const n = v.totalRecordings;
  return n === 1 ? "one debrief" : `${n} debriefs`;
}

export const trialEnding: TrialEmailTemplate = withVariants([
  variant(
    "heads_up",
    "Plain heads-up that the trial ends in 2 days; the picture gets sharper the longer she keeps going",
    () => "Your Ripple trial ends in 2 days",
    () => "A quick heads-up so nothing catches you off guard.",
    (v) => `
      ${h1("Your Ripple trial ends in 2 days")}
      ${hi(v)}
      ${para(`Quick heads-up: your free trial ends on ${escapeHtml(v.trialEndsAt)}.`)}
      ${para(`You&rsquo;ve recorded ${debriefs(v)} so far, and Ripple is starting to see how your weeks actually go. That picture gets sharper the longer you keep at it.`)}
      ${para(`To keep going, set up your subscription before the trial ends: ${displayPriceLine()}, and you pick up right where you left off. If now isn&rsquo;t the time, nothing happens automatically, and your debriefs stay yours.`)}
      ${button(upgradeUrl(v), "Keep my subscription")}
    `
  ),
  variant(
    "what_you_built",
    "Reflects back what she built (debrief count, top theme) and what she'd lose momentum on",
    (v) => (v.topTheme ? `"${v.topTheme}" keeps coming up` : "What you've built in Ripple so far"),
    () => "Your trial ends in 2 days. Here's what's already there.",
    (v) => `
      ${h1("Here&rsquo;s what you&rsquo;ve built so far.")}
      ${hi(v)}
      ${para(
        v.topTheme
          ? `In ${debriefs(v)}, one thing has come up more than anything else: <strong>${escapeHtml(v.topTheme)}</strong>. That&rsquo;s the kind of thing Ripple gets better at spotting the more you talk to it.`
          : `You&rsquo;ve recorded ${debriefs(v)}. Every one adds to your list, your habits and the patterns Ripple can show you.`
      )}
      ${para(`Your trial ends on ${escapeHtml(v.trialEndsAt)}. Keep it going for ${displayPriceLine()}, and everything stays exactly where it is.`)}
      ${button(upgradeUrl(v), "Keep my subscription")}
    `
  ),
  variant(
    "no_pressure",
    "Short, no-pressure note from Keenan: nothing auto-charges, here's the option if she wants it",
    () => "nothing happens automatically",
    () => "Your trial ends in 2 days. Your call, no surprises.",
    (v) => `
      ${hi(v)}
      ${para(`Your Ripple trial ends in two days, on ${escapeHtml(v.trialEndsAt)}. There&rsquo;s no card on file, so nothing happens automatically.`)}
      ${para(`If Ripple has been useful, you can keep it for ${displayPriceLine()}, and carry on where you left off. If it hasn&rsquo;t, I&rsquo;d honestly love a one-line reply telling me why.`)}
      ${button(upgradeUrl(v), "Keep my subscription")}
    `
  ),
]);
