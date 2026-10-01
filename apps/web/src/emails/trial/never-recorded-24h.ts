/**
 * Never-Recorded Sequence — Email 1 (24h)
 *
 * Trigger: TRIAL or FREE (funnel) user, ~24h after signup, totalRecordings = 0.
 *          Sent to ALL trial users (card on file or not).
 *
 * 2026-10-01: three versions, Jev picks (lib/email-jev.ts). Goal: she records
 * her first debrief within 3 days. Replaces the old "you dropped this..." copy.
 */
import { appBlock, exampleCard, h1, hi, men, para, variant, webLink, withVariants } from "./kit";
import type { TrialEmailTemplate } from "./types";

export const neverRecorded24h: TrialEmailTemplate = withVariants([
  variant(
    "first_one_example",
    "Shows exactly what to say first and the list Ripple hands back",
    () => "Your first debrief, made easy",
    () => "Here's exactly what to say. Ripple does the sorting.",
    (v) => `
      ${h1("Here&rsquo;s an easy first one.")}
      ${hi(v)}
      ${para("You&rsquo;re all set up. The only thing left is the part where Ripple actually helps: open the app, tap record, and say what&rsquo;s on your plate this week.")}
      ${exampleCard(v)}
      ${para("No typing, no right way to do it. Say it the way it comes out.")}
      ${appBlock(v)}
      ${webLink(v, "Use the web version")}
    `
  ),
  variant(
    "one_thing",
    "Tiny ask: say one thing you keep meaning to do",
    () => "Just one thing",
    () => "The thing you keep meaning to do. Say that.",
    (v) => `
      ${h1("Start with one thing.")}
      ${hi(v)}
      ${para("What&rsquo;s one thing you keep meaning to do and haven&rsquo;t?")}
      ${para(men(v) ? "The car insurance call. Booking the haircut. Getting back to the gym. Whatever it is, open Ripple, tap record, and say it out loud." : "The dentist. The birthday gift. That email you keep starring. Whatever it is, open Ripple, tap record, and say it out loud.")}
      ${para("Ripple turns it into a task and keeps hold of it, so you don&rsquo;t have to. That&rsquo;s your first debrief done.")}
      ${appBlock(v)}
      ${webLink(v, "Use the web version")}
    `
  ),
  variant(
    "personal_check_in",
    "Warm personal note from Keenan; offers help and invites a reply",
    () => "quick note from me",
    () => "Getting started with Ripple, and how I can help.",
    (v) => `
      ${hi(v)}
      ${para("Thanks for signing up for Ripple. I noticed you haven&rsquo;t recorded yet, which is really common on day one.")}
      ${para("Here&rsquo;s how I&rsquo;d start: next time something&rsquo;s on your mind, open the app, tap record, and talk it through like you would to a friend. Ripple pulls out your to-do list, tracks the habits you mention, and starts noticing what keeps coming up.")}
      ${para("If you got stuck anywhere, reply and tell me. I read every one.")}
      ${appBlock(v)}
      ${webLink(v, "Use the web version")}
    `
  ),
]);
