/**
 * Download Rescue #1 — Signed Up Only
 *
 * Trigger: Account created, never reached the download screen
 *          (no funnel_download_screen_viewed event), appFirstOpenedAt null.
 * Subject: "You did the hard part. The easy part's waiting."
 *
 * 2026-10-01: three versions, Jev picks (lib/email-jev.ts). Goal: she gets
 * into the Ripple app, signed in, within 3 days.
 */

import { appBlock, exampleCard, h1, hi, men, para, variant, webLink, withVariants } from "./kit";
import type { TrialEmailTemplate } from "./types";

export const rescueSignupOnly: TrialEmailTemplate = withVariants([
  variant(
    "hard_part_done",
    "She already did the hard part by signing up; getting the app is the easy part",
    () => "You did the hard part. The easy part’s waiting.",
    () => "You're signed up. The app is where it all happens.",
    (v) => `
      ${h1("You did the hard part. The easy part&rsquo;s waiting.")}
      ${hi(v)}
      ${para("You signed up, and then life probably pulled you somewhere else. Totally get it.")}
      ${para("The app is the part that does the work. You talk about your week, and Ripple catches the task buried in a sentence, the habit you keep meaning to start, and what keeps coming up. No typing.")}
      ${appBlock(v)}
      ${webLink(v, "Use the web version")}
    `
  ),
  variant(
    "show_example",
    "Shows exactly what she'd say and the list Ripple hands back, then the way in",
    () => "Here's what Ripple does with one sentence",
    () => "Say what's on your plate. Get the list back.",
    (v) => `
      ${h1("Here&rsquo;s what Ripple does with one sentence.")}
      ${hi(v)}
      ${para("You&rsquo;ve got an account but haven&rsquo;t tried the app yet. This is the whole idea:")}
      ${exampleCard(v)}
      ${para("That&rsquo;s your to-do list and your habits, sorted, from talking. Here&rsquo;s the way in:")}
      ${appBlock(v)}
      ${webLink(v, "Use the web version")}
    `
  ),
  variant(
    "quick_check_in",
    "Short personal check-in from Keenan; offers help if something got in the way",
    () => "quick check-in",
    () => "You signed up but haven't opened the app. Anything I can help with?",
    (v) => `
      ${hi(v)}
      ${para("Keenan here, one of the founders of Ripple. I saw you signed up but haven&rsquo;t opened the app yet.")}
      ${para(men(v) ? "When you&rsquo;re ready, it&rsquo;s simple: open it, tap record, and talk through what you&rsquo;re working on this week. Ripple turns it into your list and tracks the habits you mention." : "When you&rsquo;re ready, it&rsquo;s simple: open it, tap record, and talk through what&rsquo;s on your plate this week. Ripple turns it into your list and tracks the habits you mention.")}
      ${appBlock(v)}
      ${webLink(v, "Use the web version")}
      ${para("If something got in the way, reply and tell me. I read every one.")}
    `
  ),
]);
