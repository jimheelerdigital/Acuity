/**
 * Recovery Email 3 — Paid But Never Opened App
 *
 * Trigger: User has active subscription but firstRecordingAt IS NULL.
 *          2 hours after signup.
 * Subject: "Your trial started — one step left"
 * From: Keenan from Ripple <keenan@getacuity.io> (set centrally in sendTrialEmail)
 *
 * 2026-10-01: three versions, Jev picks (lib/email-jev.ts). Goal: she gets
 * into the Ripple app, signed in, within 3 days.
 */

import { appBlock, exampleCard, h1, hi, men, para, variant, withVariants } from "./kit";
import type { TrialEmailTemplate } from "./types";

export const recoveryPaidNoApp: TrialEmailTemplate = withVariants([
  variant(
    "one_step_left",
    "Your trial is live; three simple steps to get into the app and say the first thing",
    () => "Your trial started — one step left",
    () => "Your trial is live. Open the app and record your first one.",
    (v) => `
      ${h1("Your trial started. One step left.")}
      ${hi(v)}
      ${para("Your 7-day trial is live. The only thing left is getting into the app:")}
      ${para("<strong style=\"color:#C4451C;\">1.</strong> Get the app<br/><strong style=\"color:#C4451C;\">2.</strong> Tap the button below on your phone to open it signed in<br/><strong style=\"color:#C4451C;\">3.</strong> Tap record and say what&rsquo;s on your plate")}
      ${para("Ripple turns what you say into your to-do list, tracks the habits you mention, and starts showing you what keeps coming up.")}
      ${appBlock(v)}
    `
  ),
  variant(
    "show_what_you_get",
    "Shows the example of what she says and the list Ripple hands back, then the way in",
    () => "Here's what you just unlocked",
    () => "Say what's on your plate. Ripple hands back the list.",
    (v) => `
      ${h1("Here&rsquo;s what you just unlocked.")}
      ${hi(v)}
      ${para("You&rsquo;re all set up. This is what Ripple does once you&rsquo;re in the app:")}
      ${exampleCard(v)}
      ${para("No typing, no setup. Open the app on your phone and tap record.")}
      ${appBlock(v)}
    `
  ),
  variant(
    "founder_thanks",
    "Personal thank-you from Keenan for joining, with the easy way into the app",
    () => "thank you (and the easy way in)",
    () => "You're in. Here's how to open Ripple without a password.",
    (v) => `
      ${hi(v)}
      ${para("Thank you for starting your trial. Genuinely. We&rsquo;re a small team and every person who joins matters to us.")}
      ${para(men(v) ? "The app is where it all happens. Once you&rsquo;re in, tap record and talk through your week: training, the calls you keep putting off, whatever&rsquo;s on your plate." : "The app is where it all happens. Once you&rsquo;re in, tap record and talk through your week: the kids&rsquo; stuff, work, the house, whatever&rsquo;s taking up room in your head.")}
      ${para("The button below opens Ripple already signed in, so there&rsquo;s nothing to remember:")}
      ${appBlock(v)}
      ${para("If anything gets in the way, reply here. I read every one.")}
    `
  ),
]);
