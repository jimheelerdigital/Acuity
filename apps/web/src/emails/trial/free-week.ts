/**
 * No-card free week (2026-10-06, per Keenan). Web-funnel signups who left
 * without paying get a free week of Pro with no card (lib/free-week.ts):
 *   free_week_offer    — ~20 min after signup with no payment (plus the
 *                        free-plan backlog since 09-24). Goal: she taps
 *                        "Start my free week" within 2 days.
 *   free_week_followup — 2 days after the offer, still unclaimed. Same goal.
 * The button goes to /free-week, which starts the week on tap. These two
 * replace the card-trial recovery emails (recovery_signup_no_checkout,
 * recovery_checkout_abandoned) for these users. Three versions each, Jev
 * picks (lib/email-jev.ts).
 */
import { exampleCard, h1, hi, button, men, para, variant, withVariants } from "./kit";
import type { TrialEmailTemplate, TrialVars } from "./types";

function claimUrl(v: TrialVars): string {
  return v.freeWeekUrl ?? `${v.appUrl}/home`;
}

const NO_CARD = "No card, nothing to cancel. When the week ends you go back to the free plan unless you decide Pro is worth keeping.";

function whatProDoes(v: TrialVars): string {
  return men(v)
    ? "Pro turns what you say into your to-do list, tracks the habits you&rsquo;re building, and shows what keeps coming up in your week."
    : "Pro turns what you say into your to-do list, tracks the habits you&rsquo;re building, and shows you what keeps coming up in your week, the stuff that&rsquo;s hard to see from inside it.";
}

export const freeWeekOffer: TrialEmailTemplate = withVariants([
  variant(
    "week_on_us",
    "Straight offer: a free week of Pro, no card, one tap to start",
    () => "A free week of Ripple Pro, no card",
    () => "One tap starts it. Nothing to cancel.",
    (v) => `
      ${h1("A free week of Pro, on us.")}
      ${hi(v)}
      ${para("You made your Ripple account but didn&rsquo;t start Pro. So here&rsquo;s a week of it, free, without a card.")}
      ${para(whatProDoes(v))}
      ${para(NO_CARD)}
      ${button(claimUrl(v), "Start my free week")}
    `
  ),
  variant(
    "show_then_offer",
    "Shows the say-it, get-the-list example first, then the no-card week",
    () => "Try Pro for a week. No card.",
    () => "Say what's on your plate. Pro hands back the list.",
    (v) => `
      ${h1("Here&rsquo;s what a week of Pro looks like.")}
      ${hi(v)}
      ${exampleCard(v)}
      ${para("Do that a few times this week and Pro starts showing you what keeps coming up. Your week of it is free, and we don&rsquo;t need a card.")}
      ${para(NO_CARD)}
      ${button(claimUrl(v), "Start my free week")}
    `
  ),
  variant(
    "keenan_note",
    "Short personal note from Keenan: skip the card, just try it for a week",
    () => "skip the card, try it for a week",
    () => "I'd rather you try Ripple than decide from a payment screen.",
    (v) => `
      ${hi(v)}
      ${para("Keenan here, one of the founders of Ripple. You got as far as the payment screen and stopped. Fair enough. Nobody wants to hand over a card for something they haven&rsquo;t tried.")}
      ${para(`So skip the card. Here&rsquo;s a week of Pro, free. ${whatProDoes(v)}`)}
      ${para("If it doesn&rsquo;t earn its place, do nothing. You go back to the free plan and nothing is charged.")}
      ${button(claimUrl(v), "Start my free week")}
    `
  ),
]);

export const freeWeekFollowup: TrialEmailTemplate = withVariants([
  variant(
    "still_here",
    "Reminder that the free week is still waiting, with the no-card terms",
    () => "Your free week of Pro is still waiting",
    () => "No card. One tap and it starts.",
    (v) => `
      ${h1("Your free week is still here.")}
      ${hi(v)}
      ${para("A couple of days ago I sent you a free week of Ripple Pro. You haven&rsquo;t started it yet, so this is a quick nudge.")}
      ${para(whatProDoes(v))}
      ${para(NO_CARD)}
      ${button(claimUrl(v), "Start my free week")}
    `
  ),
  variant(
    "one_debrief",
    "Lowers the bar: start the week and do a single debrief, see what comes back",
    () => "Start with one debrief",
    () => "Talk for as long as you like. See what Ripple hands back.",
    (v) => `
      ${h1("Start with one debrief.")}
      ${hi(v)}
      ${para("You don&rsquo;t have to commit to a week of anything. Start your free week of Pro, open Ripple once, and say what&rsquo;s on your plate.")}
      ${exampleCard(v)}
      ${para("If what comes back is useful, keep going. If not, you&rsquo;ve lost nothing. There&rsquo;s no card on file.")}
      ${button(claimUrl(v), "Start my free week")}
    `
  ),
  variant(
    "last_note",
    "Short last note from Keenan: won't keep emailing about it, link is there if she wants it",
    () => "last note about your free week",
    () => "I won't keep emailing about it.",
    (v) => `
      ${hi(v)}
      ${para("Keenan again. Last note about this, I promise.")}
      ${para(men(v) ? "The free week of Ripple Pro is still on your account. No card. If the timing is wrong, ignore this. If you&rsquo;ve got a lot going on and want it out of your head and into a list, this is the easiest way to see if Ripple helps." : "The free week of Ripple Pro is still on your account. No card. If the timing is wrong, ignore this. If your head is full and you&rsquo;d like some of it out and into a list, this is the easiest way to see if Ripple helps.")}
      ${button(claimUrl(v), "Start my free week")}
      ${para("And if something about Ripple put you off, reply and tell me. I read every one.")}
    `
  ),
]);
