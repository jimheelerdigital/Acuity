/**
 * Never-Recorded Re-engagement Drip — Email 1 (Day 1)
 *
 * One-time backlog drip for users who signed up but never recorded.
 *
 * 2026-10-01: three versions, Jev picks (lib/email-jev.ts). Goal: she records
 * her first debrief within 3 days.
 */
import { appBlock, exampleCard, h1, hi, men, para, variant, webLink, withVariants } from "./kit";
import type { TrialEmailTemplate } from "./types";

export const nrWinback1: TrialEmailTemplate = withVariants([
  variant(
    "never_tried",
    "No-judgment note: she signed up but never tried it; here's the first step",
    () => "You never got to try it",
    () => "Ripple is still here. Here's the easiest way in.",
    (v) => `
      ${h1("You never got to try it.")}
      ${hi(v)}
      ${para("A while back you signed up for Ripple and never recorded anything. No judgment. Life gets busy.")}
      ${para("Ripple isn&rsquo;t something you set up. You talk to it. Open the app, tap record, and say what&rsquo;s on your plate:")}
      ${exampleCard(v)}
      ${appBlock(v)}
      ${webLink(v, "Use the web version")}
    `
  ),
  variant(
    "whats_on_your_plate",
    "Opens with a question about her week and makes that the first debrief",
    () => "What's on your plate this week?",
    () => "Say it to Ripple and it becomes your list.",
    (v) => `
      ${h1("What&rsquo;s on your plate this week?")}
      ${hi(v)}
      ${para(men(v) ? "Training, work, the stuff you keep putting off. Whatever the answer is, say it to Ripple." : "Work, the kids, the house, the things nobody else will remember. Whatever the answer is, say it to Ripple.")}
      ${para("Open the app, tap record, and talk. Ripple turns it into your to-do list, tracks the habits you mention, and starts noticing what keeps coming up.")}
      ${appBlock(v)}
      ${webLink(v, "Use the web version")}
    `
  ),
  variant(
    "what_it_does",
    "Plain explanation of what Ripple does with what you say",
    () => "What Ripple does with what you say",
    () => "You talk. It makes the list, tracks the habits, finds the patterns.",
    (v) => `
      ${h1("You talk. Ripple does the rest.")}
      ${hi(v)}
      ${para("Quick reminder of what you signed up for:")}
      ${para("&#10003; Say what&rsquo;s on your mind, and it becomes <strong>your to-do list</strong><br/>&#10003; Mention a habit, and Ripple <strong>tracks it</strong><br/>&#10003; Keep going, and it shows you <strong>what keeps coming up</strong>")}
      ${para("All it needs is the first debrief. Open the app and tap record.")}
      ${appBlock(v)}
      ${webLink(v, "Use the web version")}
    `
  ),
]);
