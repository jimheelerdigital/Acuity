/**
 * Stall Re-engagement — Email C (3+ recordings, 72h silent)
 *
 * Trigger: User has 3+ completed recordings AND 72h+ since their
 *          last recording. Longer silence window because established
 *          users have normal gaps.
 *
 * Invites replies — sendTrialEmail called with
 * replyTo: "keenan@getacuity.io" (real monitored inbox).
 * Links to the app (App Store link opens the installed app) + web /home.
 *
 * 2026-10-01: three versions, Jev picks (lib/email-jev.ts). Goal: she records
 * another debrief within 3 days.
 */
import { escapeHtml } from "@/lib/escape-html";
import { button, h1, hi, para, variant, webLink, withVariants } from "./kit";
import type { TrialEmailTemplate } from "./types";

const APP_LINK = "https://apps.apple.com/us/app/acuity-daily/id6762633410";

export const stall3plus: TrialEmailTemplate = withVariants([
  variant(
    "check_in_reply",
    "Personal check-in from Keenan; invites a reply if something changed",
    () => "everything okay?",
    () => "It's been a few days. Just checking in.",
    (v) => `
      ${hi(v)}
      ${para(`You&rsquo;ve recorded ${v.totalRecordings} debriefs, enough that Ripple has a real picture of your weeks. It&rsquo;s been a few days since your last one, so I wanted to check in.`)}
      ${para("Gaps are normal. If something changed or it stopped being useful, reply and tell me. And if you&rsquo;ve just been busy, pick it back up whenever.")}
      ${button(APP_LINK, "Open Ripple")}
      ${webLink(v, "Use the web version")}
    `
  ),
  variant(
    "picture_you_built",
    "Reminds her of the picture she's built and what she'd see by picking up again",
    () => "Your patterns are waiting",
    (v) => `${v.totalRecordings} debriefs in. Here's what Ripple can see.`,
    (v) => `
      ${h1("You&rsquo;ve built something real here.")}
      ${hi(v)}
      ${para(`${v.totalRecordings} debriefs is enough for Ripple to see your patterns${v.topTheme ? `, like how often <strong>${escapeHtml(v.topTheme)}</strong> comes up` : ""}. Every new one keeps that picture current.`)}
      ${para("Open the app and tell it what&rsquo;s happened since your last one.")}
      ${button(APP_LINK, "Open Ripple")}
      ${webLink(v, "Use the web version")}
    `
  ),
  variant(
    "catch_up",
    "Easy catch-up: one debrief covering the days she missed",
    () => "One debrief to catch up",
    () => "Cover the last few days in one go.",
    (v) => `
      ${h1("Catch up in one go.")}
      ${hi(v)}
      ${para("No need to make up for missed days one by one. One debrief can cover the lot: what got done, what didn&rsquo;t, what&rsquo;s coming up.")}
      ${para("Ripple sorts it into your list and keeps your habits and patterns up to date.")}
      ${button(APP_LINK, "Open Ripple")}
      ${webLink(v, "Use the web version")}
    `
  ),
]);
