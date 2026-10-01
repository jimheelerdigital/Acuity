/**
 * Never-Recorded Sequence — Email 2 (48h)
 *
 * Trigger: TRIAL or FREE (funnel) user, ~48h after signup, totalRecordings = 0.
 *          Sent to ALL trial users (card on file or not).
 *
 * 2026-10-01: three versions, Jev picks (lib/email-jev.ts). Goal: she records
 * her first debrief within 3 days. Replaces the old "uh oh... did you forget?".
 */
import { appBlock, exampleCard, h1, hi, men, para, variant, webLink, withVariants } from "./kit";
import type { TrialEmailTemplate } from "./types";

export const neverRecorded48h: TrialEmailTemplate = withVariants([
  variant(
    "what_you_get",
    "Lists the three things one debrief gives back: list, habits, patterns",
    () => "What one debrief gets you",
    () => "A to-do list, habits tracked, and the start of your patterns.",
    (v) => `
      ${h1("Here&rsquo;s what one debrief gets you.")}
      ${hi(v)}
      ${para("Talk for as long or as little as you want, and Ripple hands back:")}
      ${para("&#10003; <strong>Your to-do list</strong>, pulled out of what you said<br/>&#10003; <strong>Your habits, tracked</strong>, the ones you said you want to do<br/>&#10003; <strong>What keeps coming up</strong>, once you&rsquo;ve done a few")}
      ${para("None of it starts until the first one. Open the app and tap record.")}
      ${appBlock(v)}
      ${webLink(v, "Use the web version")}
    `
  ),
  variant(
    "anywhere_anytime",
    "Fits into the gaps: in the car, on a walk, between things",
    () => "Next time you're in the car",
    () => "Ripple works in the gaps you already have.",
    (v) => `
      ${h1("You don&rsquo;t need to find time for this.")}
      ${hi(v)}
      ${para(men(v) ? "In the car, walking out of the gym, between meetings. Any gap works. Open Ripple, tap record, and say what&rsquo;s on your plate." : "In the car, in the school pickup line, on a walk. Any gap works. Open Ripple, tap record, and say what&rsquo;s on your plate.")}
      ${exampleCard(v)}
      ${para("Ripple sorts it out. You just talk.")}
      ${appBlock(v)}
      ${webLink(v, "Use the web version")}
    `
  ),
  variant(
    "not_sure_what_to_say",
    "Answers 'I don't know what to say' with three easy prompts",
    () => "Not sure what to say?",
    () => "Three easy ways to start your first debrief.",
    (v) => `
      ${h1("Not sure what to say? Pick one.")}
      ${hi(v)}
      ${para("Most people stall on the first debrief because they don&rsquo;t know where to start. Any of these works:")}
      ${para(men(v) ? "&bull; What do I need to get done this week?<br/>&bull; What am I putting off?<br/>&bull; What do I want to do more of?" : "&bull; What&rsquo;s on my plate this week?<br/>&bull; What keeps slipping through the cracks?<br/>&bull; What do I want more time for?")}
      ${para("Open Ripple, tap record, and answer one out loud. Ripple turns it into your list and starts tracking from there.")}
      ${appBlock(v)}
      ${webLink(v, "Use the web version")}
    `
  ),
]);
