/**
 * Never-Recorded Re-engagement Drip — Email 3 (Day 6)
 *
 * Sends ~3 days after email 2, only if still 0 recordings.
 * Invites replies — replyTo keenan@getacuity.io.
 *
 * 2026-10-01: three versions, Jev picks (lib/email-jev.ts). Goal: she records
 * her first debrief within 3 days (replies are welcome too).
 */
import { appBlock, h1, hi, men, para, variant, webLink, withVariants } from "./kit";
import type { TrialEmailTemplate } from "./types";

export const nrWinback3: TrialEmailTemplate = withVariants([
  variant(
    "last_note_reply",
    "Last getting-started note; try once or reply with what held her back",
    () => "last one from me about this",
    () => "Give it one try, or tell me what got in the way.",
    (v) => `
      ${hi(v)}
      ${para("This is the last email I&rsquo;ll send about getting started. I don&rsquo;t want to crowd your inbox.")}
      ${para("You signed up for a reason, and that reason is probably still there. One debrief is all it takes to see if Ripple helps with it.")}
      ${para("And if something held you back, whether it felt like a hassle, wasn&rsquo;t clear, or the timing was wrong, reply and tell me. I read every one.")}
      ${appBlock(v)}
      ${webLink(v, "Use the web version")}
    `
  ),
  variant(
    "what_got_in_the_way",
    "Asks directly what got in the way, with three one-word reply options",
    () => "what got in the way?",
    () => "One word reply is plenty. I read every one.",
    (v) => `
      ${hi(v)}
      ${para("Quick question: what stopped you from trying Ripple? Reply with one word if that&rsquo;s easier:")}
      ${para("&bull; <strong>Time</strong>, too busy to start<br/>&bull; <strong>Unsure</strong>, didn&rsquo;t know what to say<br/>&bull; <strong>Stuck</strong>, something didn&rsquo;t work")}
      ${para("I&rsquo;ll write back. And if you&rsquo;d rather just try it, open the app and tap record.")}
      ${appBlock(v)}
      ${webLink(v, "Use the web version")}
    `
  ),
  variant(
    "door_open",
    "Kind sign-off: Ripple is there whenever she's ready, with one easy first prompt",
    () => "Whenever you're ready",
    () => "Ripple will be here. Here's the easiest way to start.",
    (v) => `
      ${h1("Whenever you&rsquo;re ready.")}
      ${hi(v)}
      ${para("I&rsquo;ll stop nudging after this. Ripple will be here whenever you want it.")}
      ${para(men(v) ? "When that is, start with one question: what am I putting off this week? Open the app, tap record, and answer it out loud." : "When that is, start with one question: what&rsquo;s taking up the most room in my head right now? Open the app, tap record, and answer it out loud.")}
      ${appBlock(v)}
      ${webLink(v, "Use the web version")}
    `
  ),
]);
