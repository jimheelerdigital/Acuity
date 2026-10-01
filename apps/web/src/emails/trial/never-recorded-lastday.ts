/**
 * Never-Recorded Sequence — Email 4 (last day)
 *
 * Trigger: TRIAL user, trialEndsAt within ~24h, totalRecordings = 0.
 *          ONLY sent to users with NO card on file / not paid.
 *
 * 2026-10-01: three versions, Jev picks (lib/email-jev.ts). Goal: she records
 * her first debrief before the trial ends. Replaces the old "last call :/".
 */
import { appBlock, exampleCard, h1, hi, men, para, variant, webLink, withVariants } from "./kit";
import type { TrialEmailTemplate } from "./types";

export const neverRecordedLastday: TrialEmailTemplate = withVariants([
  variant(
    "last_day_one_try",
    "Last day of the trial; one debrief so she knows either way",
    () => "Last day of your trial",
    () => "One debrief today, so you know either way.",
    (v) => `
      ${h1("Today&rsquo;s the last day of your trial.")}
      ${hi(v)}
      ${para("This is the last reminder I&rsquo;ll send about it. Before it ends, give Ripple one try: open the app, tap record, and say what&rsquo;s on your plate.")}
      ${exampleCard(v)}
      ${para("If it helps, you&rsquo;ll know. If it doesn&rsquo;t, you&rsquo;ll know that too.")}
      ${appBlock(v)}
      ${webLink(v, "Use the web version")}
    `
  ),
  variant(
    "one_sentence_today",
    "Smallest possible ask: one sentence today",
    () => "One sentence before it ends",
    () => "Say one thing on your mind. That's a debrief.",
    (v) => `
      ${h1("One sentence counts.")}
      ${hi(v)}
      ${para("Your trial ends today. If you only do one thing with Ripple, make it this: open the app, tap record, and say one thing you need to get done.")}
      ${para(men(v) ? "&ldquo;I need to call about the car insurance.&rdquo; That&rsquo;s a debrief. Ripple makes it a task and keeps hold of it." : "&ldquo;I need to call the dentist.&rdquo; That&rsquo;s a debrief. Ripple makes it a task and keeps hold of it.")}
      ${appBlock(v)}
      ${webLink(v, "Use the web version")}
    `
  ),
  variant(
    "honest_feedback",
    "Personal last note: try it, or reply and tell Keenan what got in the way",
    () => "before your trial ends",
    () => "Try it once, or tell me what got in the way.",
    (v) => `
      ${hi(v)}
      ${para("Your Ripple trial ends today and you haven&rsquo;t recorded yet. Totally fine. I just didn&rsquo;t want it to end without you seeing what it does.")}
      ${para("Open the app, tap record, and talk through your week. Ripple turns it into your list and starts tracking your habits.")}
      ${para("If it wasn&rsquo;t the right time, or something didn&rsquo;t work, reply and tell me. That helps me more than you&rsquo;d think.")}
      ${appBlock(v)}
      ${webLink(v, "Use the web version")}
    `
  ),
]);
