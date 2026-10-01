/**
 * Early Encouragement Email — Keep the Momentum
 *
 * Trigger: User has 2+ completed recordings AND first recording was
 *          at least 48 hours ago (habit forming across days, not a
 *          same-day burst). Only fires for users with < 5 recordings.
 * From: Keenan from Ripple <keenan@getacuity.io> (set centrally in sendTrialEmail)
 *
 * Fires once per user. NO CTA button, NO app/web link — this is
 * purely a warm reminder of why the habit pays off.
 *
 * 2026-10-01: three versions, Jev picks (lib/email-jev.ts). Goal: she records
 * another debrief within 3 days.
 */
import { escapeHtml } from "@/lib/escape-html";
import { h1, hi, men, para, variant, withVariants } from "./kit";
import type { TrialEmailTemplate, TrialVars } from "./types";

function themeLine(v: TrialVars): string {
  return v.topTheme
    ? para(`One thing Ripple is already hearing from you: <strong>${escapeHtml(v.topTheme)}</strong>. Keep talking and it&rsquo;ll show you how often it comes up, and when.`)
    : "";
}

export const keepMomentum: TrialEmailTemplate = withVariants([
  variant(
    "where_it_clicks",
    "Two debriefs in; explains that patterns show up across debriefs, not in one",
    () => "You've done two. Here's where it starts to click.",
    () => "The pattern doesn't show up in one debrief. It shows up across them.",
    (v) => `
      ${h1("You&rsquo;ve done two. Here&rsquo;s where it starts to click.")}
      ${hi(v)}
      ${para(`You&rsquo;ve recorded ${v.totalRecordings} debriefs now. That&rsquo;s further than most people get.`)}
      ${para("One debrief is a snapshot. A handful is a pattern: the things you keep coming back to, the tasks you mention and forget, where your week actually goes. Ripple gets sharper every time you talk.")}
      ${themeLine(v)}
      ${para("Keep going. It adds up.")}
    `
  ),
  variant(
    "whats_coming",
    "Previews what she'll see next: weekly report, habits, recurring themes",
    () => "What you'll see next",
    () => "A few more debriefs and Ripple starts handing things back.",
    (v) => `
      ${h1("Here&rsquo;s what&rsquo;s coming.")}
      ${hi(v)}
      ${para(`${v.totalRecordings} debriefs in. Here&rsquo;s what a few more unlock:`)}
      ${para("&#10003; <strong>Your weekly report</strong>, what your week was actually about<br/>&#10003; <strong>Habit tracking</strong> that fills itself in from what you say<br/>&#10003; <strong>What keeps coming up</strong>, the themes you might not notice yourself")}
      ${themeLine(v)}
      ${para(men(v) ? "Next time you&rsquo;re between things, open it and talk through what&rsquo;s next." : "Next time you have a quiet moment, open it and talk through what&rsquo;s on your mind.")}
    `
  ),
  variant(
    "proud_note",
    "Short warm personal note from Keenan celebrating the habit",
    () => "this is the hard part, and you're doing it",
    () => "A short note from me.",
    (v) => `
      ${hi(v)}
      ${para(`Just wanted to say: ${v.totalRecordings} debriefs across different days is the hardest part of building any habit, and you&rsquo;re doing it.`)}
      ${para("Ripple works best when it hears from you regularly. No set time, no right length. Whenever something&rsquo;s on your mind, say it.")}
      ${themeLine(v)}
      ${para("Glad you&rsquo;re here.")}
    `
  ),
]);
