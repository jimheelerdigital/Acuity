/**
 * "You're in the app, now say one thing" (2026-09-29, per Keenan: paid web
 * buyers were signing into the app and then never recording). The app's home
 * screen for a new paid user is just "No entries yet. Tap the record button
 * above to start" (changing it needs an app update), so these emails do the
 * guiding: a concrete first thing to say and what Ripple does with it.
 *   app_first_record_1 — ~30 min after first app sign-in, still 0 recordings
 *   app_first_record_2 — ~1 day later, still 0 recordings
 * Sent by the recovery orchestrator. Include the backup sign-in link
 * (APP_ACCESS_EMAIL_KEYS) in case they were signed out.
 *
 * 2026-10-01: three versions each, Jev picks per person (lib/email-jev.ts).
 * Goal for both: she records a debrief within 3 days.
 */
import { appAccessBlock, exampleCard, h1, hi, men, para, row, variant, withVariants } from "./kit";
import type { TrialEmailTemplate, TrialVars } from "./types";

function backupSignIn(v: TrialVars): string {
  if (!v.signInUrl) return "";
  return `${para("Signed out, or on a new phone? This opens Ripple signed in:")}${row(appAccessBlock(v))}`;
}

export const appFirstRecord1: TrialEmailTemplate = withVariants([
  variant(
    "show_example",
    "Shows exactly what to say and the list Ripple hands back",
    () => "You're in. Here's your first one",
    () => "Open Ripple, tap record, and say three things on your plate.",
    (v) => `
      ${h1("You&rsquo;re in. Now say one thing.")}
      ${hi(v)}
      ${para("The fastest way to see what Ripple does: open the app, tap the big record button at the top, and say three things on your plate this week. No typing, no right way to do it.")}
      ${exampleCard(v)}
      ${para("That&rsquo;s it. The list is made, the habits start tracking, and by the end of the week you&rsquo;ll see what kept coming up.")}
      ${backupSignIn(v)}
    `
  ),
  variant(
    "one_tap",
    "Tiny ask: the first one is a single tap and one sentence",
    () => "One tap, one sentence",
    () => "That's the whole first step. Ripple does the sorting.",
    (v) => `
      ${h1("One tap. One sentence.")}
      ${hi(v)}
      ${para("You don&rsquo;t need to set anything up. Open Ripple, tap record, and say one thing you keep meaning to do.")}
      ${para(men(v) ? "&ldquo;I keep putting off the car insurance call.&rdquo; That counts. Ripple turns it into a task and remembers it so you don&rsquo;t have to." : "&ldquo;I keep forgetting to call the dentist.&rdquo; That counts. Ripple turns it into a task and remembers it so you don&rsquo;t have to.")}
      ${para("Once it has a few of those, it starts showing you what keeps coming up.")}
      ${backupSignIn(v)}
    `
  ),
  variant(
    "personal_note",
    "Short personal note from Keenan, asks her to try it and reply",
    () => "quick one from me",
    () => "You signed in. Here's the one thing I'd do next.",
    (v) => `
      ${hi(v)}
      ${para("Saw you got into Ripple. Thank you for trying it.")}
      ${para(men(v) ? "If I were you, I&rsquo;d open it now and tap record on whatever you&rsquo;re putting off this week. Gym, a call, a bill, anything. Just talk it through like you would to a friend." : "If I were you, I&rsquo;d open it now and tap record on whatever is taking up room in your head this week. School stuff, work, the house, anything. Just talk it through like you would to a friend.")}
      ${para("Ripple sorts it into your list and starts keeping track. If anything feels off, reply here. I read every one.")}
      ${backupSignIn(v)}
    `
  ),
]);

export const appFirstRecord2: TrialEmailTemplate = withVariants([
  variant(
    "still_one_tap",
    "Gentle reminder that the first debrief is one tap, with the example",
    () => "Still one tap away",
    () => "Tap record and say what's on your plate. Ripple does the rest.",
    (v) => `
      ${h1("Your first one takes one tap.")}
      ${hi(v)}
      ${para("You haven&rsquo;t recorded anything yet, so Ripple hasn&rsquo;t had a chance to help. Next time something&rsquo;s on your mind, in the car, on a walk, between things, open the app and tap record. Say it however it comes out.")}
      ${exampleCard(v)}
      ${backupSignIn(v)}
    `
  ),
  variant(
    "what_you_miss",
    "What she gets after one debrief: the list, the habit, the pattern",
    () => "What one debrief gets you",
    () => "A list, a habit tracked, and the start of your patterns.",
    (v) => `
      ${h1("Here&rsquo;s what one debrief gets you.")}
      ${hi(v)}
      ${para("Talk for as long or as little as you want, and Ripple hands back three things:")}
      ${para("&#10003; <strong>Your to-do list</strong>, pulled out of what you said<br/>&#10003; <strong>Habits tracked</strong>, the ones you mentioned wanting to do<br/>&#10003; <strong>What keeps coming up</strong>, once you&rsquo;ve done a few")}
      ${para("All you do is open the app and tap record.")}
      ${backupSignIn(v)}
    `
  ),
  variant(
    "stuck_reply",
    "Assumes something got in the way; offers help and asks for a reply",
    () => "did something get in the way?",
    () => "If Ripple isn't working for you, I want to know.",
    (v) => `
      ${hi(v)}
      ${para("You signed into Ripple yesterday but haven&rsquo;t recorded yet. Usually that means one of three things: not sure what to say, something didn&rsquo;t work, or life got busy.")}
      ${para("If it&rsquo;s the first one, just say what&rsquo;s on your plate this week. That&rsquo;s a perfect first debrief.")}
      ${para("If it&rsquo;s the second, reply and tell me what happened. I&rsquo;ll fix it.")}
      ${backupSignIn(v)}
    `
  ),
]);
