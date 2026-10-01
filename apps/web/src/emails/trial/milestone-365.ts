/**
 * Milestone Email — 365 Recordings
 *
 * Year recognition — no CTA buttons, pure acknowledgment.
 * Reply-to: keenan@getacuity.io.
 *
 * 2026-10-01: three versions, Jev picks (lib/email-jev.ts). Goal: she replies
 * (no button; counted as clicks when present).
 */
import { escapeHtml } from "@/lib/escape-html";
import { h1, hi, para, variant, withVariants } from "./kit";
import type { TrialEmailTemplate } from "./types";

export const milestone365: TrialEmailTemplate = withVariants([
  variant(
    "look_how_far",
    "Straight acknowledgment of a year of debriefs, invites a reply",
    () => "look how far you've come",
    () => "365 debriefs. That's a year of showing up for yourself.",
    (v) => `
      ${h1("Look how far you&rsquo;ve come.")}
      ${hi(v)}
      ${para("Three hundred and sixty-five debriefs. That&rsquo;s a year of paying attention to your own life.")}
      ${para("Somewhere in all of them is a real record: what you worried about, what you worked through, what mattered, how things changed. That&rsquo;s the whole point of this.")}
      ${para("I just wanted to stop and acknowledge it. Thank you for trusting Ripple with all of that. If you ever want to tell me what this year has meant, I&rsquo;ll read every word.")}
    `
  ),
  variant(
    "year_in_one_line",
    "Asks her to sum up her year of debriefs in one line, by reply",
    () => "a year of debriefs",
    () => "If you summed up the year in one line, what would it be?",
    (v) => `
      ${hi(v)}
      ${para("You just hit 365 debriefs with Ripple. A full year of them.")}
      ${para(v.topTheme ? `Across all of it, <strong>${escapeHtml(v.topTheme)}</strong> came up more than anything else. I&rsquo;m curious if that matches how the year felt.` : "I&rsquo;m curious how the year looks to you now, looking back.")}
      ${para("If you summed it up in one line, what would it be? Hit reply. And thank you, truly.")}
    `
  ),
  variant(
    "thank_you",
    "Short, warm thank-you from Keenan; no ask beyond an open invitation to reply",
    () => "thank you",
    () => "365 debriefs. I wanted to say it properly.",
    (v) => `
      ${h1("Thank you.")}
      ${hi(v)}
      ${para("365 debriefs. Most people never give themselves this kind of attention once, and you did it all year.")}
      ${para("We&rsquo;re a small team, and people like you are why we keep building. Here&rsquo;s to the next year. Reply any time, I&rsquo;m always around.")}
    `
  ),
]);
