/**
 * Winback Ladder — Email 1 (7 days silent)
 *
 * Trigger: totalRecordings >= 1, lastRecordingAt 7+ days ago,
 *          NOT currently paying (subscriptionStatus != PRO).
 * Invites replies — replyTo keenan@getacuity.io.
 *
 * 2026-10-01: three versions, Jev picks (lib/email-jev.ts). Goal: she records again.
 */
import { escapeHtml } from "@/lib/escape-html";
import { h1, hi, men, para, primaryButton, row, variant, webLink, withVariants } from "./kit";
import type { TrialEmailTemplate, TrialVars } from "./types";

const APP_LINK = "https://apps.apple.com/us/app/acuity-daily/id6762633410";

function cta(v: TrialVars): string {
  return `${row(primaryButton(APP_LINK, "Open Ripple"), 8)}${webLink(v, "Use the web version")}`;
}

export const winback7d: TrialEmailTemplate = withVariants([
  variant(
    "catch_up",
    "Easy restart: one catch-up debrief on the last week, no need to explain the gap",
    () => "a quick catch-up?",
    () => "One debrief on the last week and your list is current again.",
    (v) => `
      ${h1("Just catch it up.")}
      ${hi(v)}
      ${para("It&rsquo;s been about a week since your last debrief. No need to explain the gap or start over.")}
      ${para(men(v) ? "Open Ripple and talk through the week: what you got done, what you skipped, what&rsquo;s coming up. Ripple turns it into your list and puts your habits back on track." : "Open Ripple and talk through the week: what happened, what&rsquo;s still hanging over you, what&rsquo;s coming up. Ripple turns it into your list and picks your habits back up.")}
      ${para("If something got in the way, reply and tell me. I read every one.")}
      ${cta(v)}
    `
  ),
  variant(
    "whats_waiting",
    "Her past debriefs and list are still there, and Ripple is ready where she left off",
    () => "your list is still here",
    () => "Everything you told Ripple is waiting where you left it.",
    (v) => `
      ${h1("Right where you left it.")}
      ${hi(v)}
      ${para(`Your ${v.totalRecordings === 1 ? "debrief is" : `${v.totalRecordings} debriefs are`} still in Ripple, along with the list and habits that came out of ${v.totalRecordings === 1 ? "it" : "them"}.${v.topTheme ? ` The thing that came up most: <strong>${escapeHtml(v.topTheme)}</strong>.` : ""}`)}
      ${para("A week of new stuff has happened since. Tell Ripple what&rsquo;s on your plate now and it&rsquo;ll fold it into what it already knows.")}
      ${cta(v)}
    `
  ),
  variant(
    "honest_check",
    "Short personal check-in from Keenan asking what got in the way",
    () => "how's it going?",
    () => "A week since your last debrief. Was it the app, or just life?",
    (v) => `
      ${hi(v)}
      ${para("Noticed it&rsquo;s been a week since your last debrief, so I wanted to check in.")}
      ${para("Usually it&rsquo;s just a busy week. Sometimes it&rsquo;s something about Ripple that didn&rsquo;t click. If it&rsquo;s the second one, hit reply and tell me. I want to fix it.")}
      ${para("If it&rsquo;s the first, the easiest way back in is one debrief on whatever&rsquo;s on your mind right now.")}
      ${cta(v)}
    `
  ),
]);
