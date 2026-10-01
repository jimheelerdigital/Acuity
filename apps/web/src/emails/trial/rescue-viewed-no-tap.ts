/**
 * Download Rescue #2 — Viewed Download, No Tap
 *
 * Trigger: Has funnel_download_screen_viewed but no funnel_app_store_clicked,
 *          appFirstOpenedAt null. NOT webview-blocked.
 * Subject: "Did something get in the way?"
 *
 * This email explicitly invites replies — sendTrialEmail is called with
 * replyTo: "keenan@getacuity.io" so replies go to a real monitored inbox.
 *
 * 2026-10-01: three versions, Jev picks (lib/email-jev.ts). Goal: she gets
 * into the Ripple app, signed in, within 3 days. Every version still
 * invites a reply.
 */

import { appBlock, exampleCard, h1, hi, para, variant, webLink, withVariants } from "./kit";
import type { TrialEmailTemplate } from "./types";

export const rescueViewedNoTap: TrialEmailTemplate = withVariants([
  variant(
    "something_in_the_way",
    "Personal check-in: she stopped at the download step; asks what got in the way",
    () => "Did something get in the way?",
    () => "You got right to the last step. Just checking in.",
    (v) => `
      ${h1("Did something get in the way?")}
      ${hi(v)}
      ${para("You made it all the way to the download step and then stopped, so I wanted to check in myself.")}
      ${para("If the download didn&rsquo;t work, or you weren&rsquo;t sure it was worth it, or you just got pulled away, I&rsquo;d like to know. Hit reply and tell me. I read every one.")}
      ${para("And if you&rsquo;re ready, here&rsquo;s the way in:")}
      ${appBlock(v)}
      ${webLink(v, "Use the web version")}
    `
  ),
  variant(
    "last_step",
    "Upbeat: she was one tap from the end; here's that last tap",
    () => "You were one tap away",
    () => "Here's the last step, ready when you are.",
    (v) => `
      ${h1("You were one tap away.")}
      ${hi(v)}
      ${para("You got right to the end of setup. All that&rsquo;s left is getting the app and opening your account:")}
      ${appBlock(v)}
      ${para("Then tap record and say what&rsquo;s on your plate. Ripple handles the list.")}
      ${webLink(v, "Use the web version")}
      ${para("If something didn&rsquo;t work, just reply. I&rsquo;ll sort it out.")}
    `
  ),
  variant(
    "worth_it",
    "For the unsure: shows what she gets from one debrief before asking her in",
    () => "Not sure it's worth it? Here's the whole idea",
    () => "You talk. Ripple hands back your list.",
    (v) => `
      ${h1("Here&rsquo;s the whole idea.")}
      ${hi(v)}
      ${para("If you paused at the download because you weren&rsquo;t sure what you&rsquo;d get, this is it:")}
      ${exampleCard(v)}
      ${para("Do that a few times and Ripple starts showing you what keeps coming up in your weeks.")}
      ${appBlock(v)}
      ${webLink(v, "Use the web version")}
      ${para("Still unsure? Reply with your question. I answer every one.")}
    `
  ),
]);
