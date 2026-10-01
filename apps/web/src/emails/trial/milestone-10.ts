/**
 * Milestone Email — 10 Recordings
 *
 * Feedback ask + App Store review request.
 * Reply-to: keenan@getacuity.io (real monitored inbox).
 *
 * 2026-10-01: three versions, Jev picks (lib/email-jev.ts). Goal: she clicks
 * the review button (and replies with feedback).
 */
import { escapeHtml } from "@/lib/escape-html";
import { button, h1, hi, men, para, variant, withVariants } from "./kit";
import type { TrialEmailTemplate } from "./types";

const REVIEW_URL = "https://apps.apple.com/app/id6762633410?action=write-review";

export const milestone10: TrialEmailTemplate = withVariants([
  variant(
    "how_is_it_feeling",
    "Celebrates 10 debriefs, asks how it's going by reply, then asks for a review",
    () => "10 in. How's it feeling?",
    () => "You've got a real habit going. Quick question.",
    (v) => `
      ${h1("10 in. How&rsquo;s it feeling?")}
      ${hi(v)}
      ${para("Ten debriefs. That&rsquo;s a habit taking hold, and most people never get this far.")}
      ${para("I&rsquo;m curious how it&rsquo;s landing. Is Ripple catching the things that matter? Anything that&rsquo;s clicked, or anything that bugs you? Hit reply, I read every one.")}
      ${para("And if you&rsquo;re liking it, one small favor: an App Store review. We&rsquo;re a small team and every review helps someone else find Ripple.")}
      ${button(REVIEW_URL, "Leave a review")}
    `
  ),
  variant(
    "review_first",
    "Leads with a short, direct review ask; feedback reply as a secondary line",
    () => "a small favor?",
    () => "Ten debriefs in. Would you leave Ripple a review?",
    (v) => `
      ${hi(v)}
      ${para("You&rsquo;ve done ten debriefs with Ripple. Thank you for sticking with it.")}
      ${para("Could I ask a small favor? If Ripple&rsquo;s been useful, a quick App Store review is the single biggest thing that helps people like you find it.")}
      ${button(REVIEW_URL, "Leave a review")}
      ${para("And if something&rsquo;s not right, reply instead. I&rsquo;d rather hear it from you.")}
    `
  ),
  variant(
    "what_it_caught",
    "Reflects what Ripple has picked up so far (top theme) before the review ask",
    () => "10 debriefs. Here's what Ripple's noticed",
    () => "Ten in, and the patterns are starting to show.",
    (v) => `
      ${h1("Ten debriefs in.")}
      ${hi(v)}
      ${para(v.topTheme ? `After ten debriefs, the thing you talk about most is <strong>${escapeHtml(v.topTheme)}</strong>. That&rsquo;s the kind of thing Ripple gets better at spotting the more you use it.` : "After ten debriefs, Ripple has enough to start spotting what keeps coming up for you. It gets sharper from here.")}
      ${para(men(v) ? "If it&rsquo;s been helping you stay on top of things, a quick App Store review would mean a lot to us." : "If it&rsquo;s been helping you keep track of everything, a quick App Store review would mean a lot to us.")}
      ${button(REVIEW_URL, "Leave a review")}
      ${para("Anything you&rsquo;d change? Just reply.")}
    `
  ),
]);
