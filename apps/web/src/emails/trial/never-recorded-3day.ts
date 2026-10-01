/**
 * Never-Recorded Sequence — Email 3 (3 days left)
 *
 * Trigger: TRIAL user, trialEndsAt ~3 days out, totalRecordings = 0.
 *          ONLY sent to users with NO card on file / not paid.
 *
 * 2026-10-01: three versions, Jev picks (lib/email-jev.ts). Goal: she records
 * her first debrief within 3 days, before the trial ends.
 */
import { appBlock, exampleCard, h1, hi, men, para, variant, webLink, withVariants } from "./kit";
import type { TrialEmailTemplate } from "./types";

export const neverRecorded3day: TrialEmailTemplate = withVariants([
  variant(
    "see_it_once",
    "Trial ends soon; try it once so you know if it's for you",
    () => "Three days left to try it once",
    (v) => `Your trial runs until ${v.trialEndsAt}. See what it does first.`,
    (v) => `
      ${h1("Try it once before it ends.")}
      ${hi(v)}
      ${para(`Your free trial runs until ${v.trialEndsAt}, and you haven&rsquo;t had a chance to see what Ripple does yet.`)}
      ${para("One debrief is enough to know. Open the app, tap record, and say what&rsquo;s on your plate this week. If it&rsquo;s not for you, no harm done.")}
      ${exampleCard(v)}
      ${appBlock(v)}
      ${webLink(v, "Use the web version")}
    `
  ),
  variant(
    "three_days_three_debriefs",
    "Three days is enough for three debriefs and a first glimpse of patterns",
    () => "Three days, three debriefs",
    () => "Enough to see what keeps coming up for you.",
    (v) => `
      ${h1("Three days is enough to see it work.")}
      ${hi(v)}
      ${para(`Your trial runs until ${v.trialEndsAt}. Here&rsquo;s a simple way to use what&rsquo;s left: one debrief a day, whenever it suits you.`)}
      ${para("Day one, you get your list. Day two, Ripple starts tracking your habits. Day three, you start seeing what keeps coming up.")}
      ${para(men(v) ? "Start with whatever you&rsquo;re putting off this week. Open Ripple and tap record." : "Start with whatever is taking up the most room in your head this week. Open Ripple and tap record.")}
      ${appBlock(v)}
      ${webLink(v, "Use the web version")}
    `
  ),
  variant(
    "why_you_signed_up",
    "Reminds her of the reason she signed up; invites a reply if something's in the way",
    () => "you signed up for a reason",
    () => "Still worth finding out if Ripple helps.",
    (v) => `
      ${hi(v)}
      ${para(men(v) ? "Something made you sign up for Ripple. Maybe you wanted to stop losing track of things, or finally stick with a habit." : "Something made you sign up for Ripple. Maybe too much to keep track of, or wanting to finally see where your weeks go.")}
      ${para(`That reason is probably still there. Your trial runs until ${v.trialEndsAt}, so there&rsquo;s still time to see if Ripple helps with it. Open the app, tap record, and talk about it.`)}
      ${para("And if something got in the way, reply and tell me. I read every one.")}
      ${appBlock(v)}
      ${webLink(v, "Use the web version")}
    `
  ),
]);
