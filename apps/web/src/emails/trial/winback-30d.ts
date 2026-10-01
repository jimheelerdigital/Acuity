/**
 * Winback Ladder — Email 3 (30 days silent)
 *
 * Trigger: totalRecordings >= 1, lastRecordingAt 30+ days ago,
 *          NOT currently paying.
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

export const winback30d: TrialEmailTemplate = withVariants([
  variant(
    "the_reason",
    "Reminds her of why she signed up and that the reason is still there",
    () => "the reason you signed up",
    () => "It didn't go away just because the habit stalled.",
    (v) => `
      ${h1("The reason you signed up.")}
      ${hi(v)}
      ${para("It&rsquo;s been about a month. I&rsquo;m not writing to guilt you. Something made you want to get a better handle on things, and that probably hasn&rsquo;t gone anywhere.")}
      ${para("Ripple is still here for exactly that: you talk, it turns it into your list, tracks your habits and shows you what keeps coming up.")}
      ${para("If you want to give it another go, one debrief is all it takes.")}
      ${cta(v)}
    `
  ),
  variant(
    "what_was_missing",
    "Direct feedback ask: what would have made Ripple worth keeping, reply to Keenan",
    () => "can I ask what happened?",
    () => "What would have made Ripple worth keeping?",
    (v) => `
      ${hi(v)}
      ${para("It&rsquo;s been about a month since your last debrief, so I&rsquo;ll just ask: what happened?")}
      ${para("Maybe it didn&rsquo;t click. Maybe it felt like one more thing to do. Maybe it was missing something you needed. Whatever it was, I&rsquo;d really like to know. Hit reply, even one line helps.")}
      ${para("And if it was just a busy month, your debriefs are still here.")}
      ${cta(v)}
    `
  ),
  variant(
    "month_recap",
    "Offers a one-debrief recap of the last month so Ripple is current again",
    () => "a month in one debrief",
    () => "Talk through the last month and Ripple sorts it out.",
    (v) => `
      ${h1("A month in one debrief.")}
      ${hi(v)}
      ${para(`A lot can happen in a month.${v.topTheme ? ` Last time, <strong>${escapeHtml(v.topTheme)}</strong> was what kept coming up. Is it still?` : ""}`)}
      ${para(men(v) ? "Open Ripple and talk through the month: what moved, what stalled, what you want to get back on. It&rsquo;ll pull out your list and pick your habits back up." : "Open Ripple and talk through the month: what happened, what&rsquo;s still on your mind, what&rsquo;s coming up. It&rsquo;ll pull out your list and pick your habits back up.")}
      ${cta(v)}
    `
  ),
]);
