/**
 * Winback Ladder — Email 2 (14 days silent)
 *
 * Trigger: totalRecordings >= 1, lastRecordingAt 14+ days ago,
 *          NOT currently paying.
 *
 * 2026-10-01: three versions, Jev picks (lib/email-jev.ts). Goal: she records again.
 */
import { h1, hi, men, para, primaryButton, row, variant, webLink, withVariants } from "./kit";
import type { TrialEmailTemplate, TrialVars } from "./types";

const APP_LINK = "https://apps.apple.com/us/app/acuity-daily/id6762633410";

function cta(v: TrialVars): string {
  return `${row(primaryButton(APP_LINK, "Open Ripple"), 8)}${webLink(v, "Use the web version")}`;
}

export const winback14d: TrialEmailTemplate = withVariants([
  variant(
    "it_adds_up",
    "Ripple gets more useful with every debrief; patterns need more than a few",
    () => "it adds up",
    () => "The more you tell Ripple, the more it can show you.",
    (v) => `
      ${h1("It adds up.")}
      ${hi(v)}
      ${para("A couple of weeks since your last debrief, so just one thing worth knowing.")}
      ${para("Ripple gets more useful the more you use it. One debrief gives you a list. A few weeks of them show you what keeps coming up, which habits actually stick, and where your week really goes.")}
      ${para("Pick it back up whenever you&rsquo;re ready. One debrief is enough to start.")}
      ${cta(v)}
    `
  ),
  variant(
    "fresh_start",
    "No catching up needed: start fresh with whatever is on her plate today",
    () => "start from today",
    () => "No need to fill in the last two weeks. Just today.",
    (v) => `
      ${h1("Start from today.")}
      ${hi(v)}
      ${para("You don&rsquo;t have to fill in the last two weeks. Ripple doesn&rsquo;t keep score.")}
      ${para(men(v) ? "Open it, tap record, and say what you want to get done this week: the workout, the call you keep dodging, the thing you said you&rsquo;d start. Ripple turns it into your list and tracks the habits." : "Open it, tap record, and say what&rsquo;s on your plate this week: the appointments, the errands, the thing you keep meaning to get to. Ripple turns it into your list and tracks the habits.")}
      ${cta(v)}
    `
  ),
  variant(
    "one_thing",
    "Tiny ask: say one thing she keeps putting off",
    () => "one thing you keep putting off",
    () => "Say it once to Ripple and stop carrying it around.",
    (v) => `
      ${hi(v)}
      ${para("Here&rsquo;s a small one. What&rsquo;s the one thing you keep meaning to do and haven&rsquo;t?")}
      ${para("Open Ripple and say it out loud. It goes on your list, Ripple keeps track of it, and you can stop holding it in your head.")}
      ${para("That&rsquo;s the whole ask.")}
      ${cta(v)}
    `
  ),
]);
