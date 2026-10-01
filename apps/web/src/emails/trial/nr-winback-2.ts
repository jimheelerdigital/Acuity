/**
 * Never-Recorded Re-engagement Drip — Email 2 (Day 3)
 *
 * Sends ~2 days after email 1, only if still 0 recordings.
 *
 * 2026-10-01: three versions, Jev picks (lib/email-jev.ts). Goal: she records
 * her first debrief within 3 days.
 */
import { appBlock, exampleCard, h1, hi, men, para, variant, webLink, withVariants } from "./kit";
import type { TrialEmailTemplate } from "./types";

export const nrWinback2: TrialEmailTemplate = withVariants([
  variant(
    "before_after_list",
    "Shows a messy spoken sentence turning into a clean list",
    () => "What one debrief gets you",
    () => "You say it messy. Ripple hands it back sorted.",
    (v) => `
      ${h1("Say it messy. Get it back sorted.")}
      ${hi(v)}
      ${para("You don&rsquo;t need to organize anything before you talk. Here&rsquo;s what a first debrief can look like:")}
      ${exampleCard(v, "You say:")}
      ${para("Open Ripple and tap record. That&rsquo;s the whole first step.")}
      ${appBlock(v)}
      ${webLink(v, "Use the web version")}
    `
  ),
  variant(
    "no_blank_page",
    "No writing, no blank page, no setup: just talk",
    () => "No writing. No setup.",
    () => "If journaling never stuck, this is different.",
    (v) => `
      ${h1("No writing. No blank page.")}
      ${hi(v)}
      ${para(men(v) ? "If writing things down never stuck for you, that&rsquo;s exactly who Ripple is for. You just talk." : "If journaling or to-do apps never stuck for you, that&rsquo;s exactly who Ripple is for. You just talk.")}
      ${para("Open the app, tap record, and say what&rsquo;s on your mind. Ripple pulls out the tasks, tracks the habits, and keeps it all in one place.")}
      ${appBlock(v)}
      ${webLink(v, "Use the web version")}
    `
  ),
  variant(
    "patterns_promise",
    "Leads with patterns: what keeps coming up, shown back to her",
    () => "What keeps coming up for you?",
    () => "Ripple shows you, once you start talking to it.",
    (v) => `
      ${h1("What keeps coming up for you?")}
      ${hi(v)}
      ${para(men(v) ? "Most of us have a few things that come up every week: the workout we skip, the call we avoid, the plan we keep remaking. Ripple notices them for you." : "Most of us have a few things that come up every week: the same worry, the same errand, the same thing we never get to. Ripple notices them for you.")}
      ${para("It starts with one debrief. Open the app, tap record, and talk about your week.")}
      ${appBlock(v)}
      ${webLink(v, "Use the web version")}
    `
  ),
]);
