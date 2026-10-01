/**
 * Milestone Email — 25 Recordings
 *
 * Feedback ask + App Store review request.
 * Reply-to: keenan@getacuity.io.
 *
 * 2026-10-01: three versions, Jev picks (lib/email-jev.ts). Goal: she clicks
 * the review button (and replies with feedback).
 */
import { escapeHtml } from "@/lib/escape-html";
import { button, h1, hi, para, variant, withVariants } from "./kit";
import type { TrialEmailTemplate } from "./types";

const REVIEW_URL = "https://apps.apple.com/app/id6762633410?action=write-review";

export const milestone25: TrialEmailTemplate = withVariants([
  variant(
    "can_i_ask",
    "Honest how's-it-going question by reply, then the review ask",
    () => "can I ask you something?",
    () => "25 debriefs in. I want to know how it's really going.",
    (v) => `
      ${h1("Can I ask you something?")}
      ${hi(v)}
      ${para("Twenty-five debriefs. Ripple&rsquo;s clearly part of your routine, and I&rsquo;d rather ask than assume it&rsquo;s all working.")}
      ${para("Is it catching what matters? Is anything annoying or missing? Hit reply, your honest take changes what we build.")}
      ${para("And if you&rsquo;re liking it, would you leave a review in the App Store? It takes a moment and it&rsquo;s the biggest help we get.")}
      ${button(REVIEW_URL, "Leave a review")}
    `
  ),
  variant(
    "twenty_five_thanks",
    "Thank-you note for 25 debriefs with a single review button",
    () => "25 debriefs. Thank you",
    () => "A quick thank-you, and one small ask.",
    (v) => `
      ${hi(v)}
      ${para("Twenty-five debriefs with Ripple. I just wanted to say thank you for using it this much.")}
      ${para("If it&rsquo;s earned it, a review in the App Store helps more than you&rsquo;d think. Most people find apps like ours through what other people say.")}
      ${button(REVIEW_URL, "Leave a review")}
    `
  ),
  variant(
    "pattern_so_far",
    "Points to her biggest theme so far, then asks for a review",
    () => "what 25 debriefs show",
    () => "Ripple's got a real picture of your weeks now.",
    (v) => `
      ${h1("Twenty-five debriefs.")}
      ${hi(v)}
      ${para(v.topTheme ? `That&rsquo;s enough for a real picture. Across all of them, <strong>${escapeHtml(v.topTheme)}</strong> comes up the most. Worth a look in your patterns if you haven&rsquo;t lately.` : "That&rsquo;s enough for a real picture of your weeks. Worth a look at your patterns if you haven&rsquo;t lately.")}
      ${para("If Ripple&rsquo;s been worth it, an App Store review would help us a lot.")}
      ${button(REVIEW_URL, "Leave a review")}
      ${para("Something you&rsquo;d change? Reply and tell me.")}
    `
  ),
]);
