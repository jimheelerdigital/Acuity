/**
 * Winback Ladder — Email 4 (90 days silent — FINAL)
 *
 * Trigger: totalRecordings >= 1, lastRecordingAt 90+ days ago,
 *          NOT currently paying. HARD STOP — no emails after this.
 * Invites replies — replyTo keenan@getacuity.io.
 *
 * No CTA buttons — this is a farewell + feedback ask only.
 *
 * 2026-10-01: three versions, Jev picks (lib/email-jev.ts). Goal: she records
 * again (the reply ask is the real ask; there is no button to click).
 */
import { h1, hi, para, variant, withVariants } from "./kit";
import type { TrialEmailTemplate } from "./types";

export const winback90d: TrialEmailTemplate = withVariants([
  variant(
    "three_questions",
    "Last email; asks three quick questions about why she stopped",
    () => "done after this one",
    () => "One last note, and one favor to ask.",
    (v) => `
      ${h1("Done after this one.")}
      ${hi(v)}
      ${para("It&rsquo;s been a few months, so this is the last of these I&rsquo;ll send.")}
      ${para("One favor before I go. Knowing why Ripple didn&rsquo;t stick would help me more than almost anything. If you have a moment, hit reply and tell me:")}
      ${para("&mdash; What was missing?<br/>&mdash; What could we have done better?<br/>&mdash; What made you stop?")}
      ${para("No wrong answers, and I read every reply myself. Your account and your debriefs are still here if you ever want them. Thank you for giving it a try.")}
    `
  ),
  variant(
    "one_line",
    "Last email; asks for a single honest line about what didn't work",
    () => "one line before I stop emailing",
    () => "This is the last one. I'd love one honest sentence.",
    (v) => `
      ${hi(v)}
      ${para("This is the last email you&rsquo;ll get from me about Ripple. I won&rsquo;t keep filling your inbox.")}
      ${para("If you have a second, reply with one line: what didn&rsquo;t work for you? Too much effort, not useful enough, something missing, just not for you. Any of it helps.")}
      ${para("Your debriefs are still saved if you ever come back. Thanks for trying it.")}
    `
  ),
  variant(
    "door_open",
    "Warm goodbye; door is open, data is safe, reply if she wants to share anything",
    () => "thank you for trying Ripple",
    () => "Last note from me. Your account stays here if you want it.",
    (v) => `
      ${h1("Thank you for trying it.")}
      ${hi(v)}
      ${para("It&rsquo;s been a while, so I&rsquo;ll stop sending these after today.")}
      ${para("Your account and everything you recorded are still here. If you ever want to pick it back up, open the app and tap record. It&rsquo;ll be where you left it.")}
      ${para("And if you&rsquo;re willing to tell me why it didn&rsquo;t fit, just reply. I read every one, and it genuinely shapes what we build next.")}
    `
  ),
]);
