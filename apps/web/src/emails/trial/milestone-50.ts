/**
 * Milestone Email — 50 Recordings
 *
 * Testimonial ask (no review button — story request instead).
 * Reply-to: keenan@getacuity.io.
 *
 * 2026-10-01: three versions, Jev picks (lib/email-jev.ts). Goal: she replies
 * with her story (the reply is the ask; counted as clicks when present).
 */
import { h1, hi, men, para, variant, withVariants } from "./kit";
import type { TrialEmailTemplate } from "./types";

export const milestone50: TrialEmailTemplate = withVariants([
  variant(
    "whats_it_done",
    "Asks what Ripple has actually done for her, and permission to share it",
    () => "what's it done for you?",
    () => "Fifty debriefs in. I'd love to hear your story.",
    (v) => `
      ${h1("What&rsquo;s it done for you?")}
      ${hi(v)}
      ${para("Fifty debriefs. You&rsquo;re exactly who we built this for.")}
      ${para("So I&rsquo;d love to know: what has Ripple actually done for you? Something you noticed that you&rsquo;d been missing? Things you stopped dropping? A pattern that changed how you do something?")}
      ${para("Hit reply and tell me, even a sentence or two. And if it&rsquo;s okay to share what you say (anonymously or with your first name, your call), that would mean a lot.")}
    `
  ),
  variant(
    "one_sentence",
    "Asks for one sentence she'd say to a friend about Ripple",
    () => "one sentence?",
    () => "How would you describe Ripple to a friend?",
    (v) => `
      ${hi(v)}
      ${para("You&rsquo;ve done fifty debriefs, so you know Ripple better than most.")}
      ${para(men(v) ? "If a friend asked what Ripple does for you, what would you say? Reply with that one sentence." : "If a friend asked what Ripple does for you, what would you tell her? Reply with that one sentence.")}
      ${para("Real words from real people explain this better than anything I write. If it&rsquo;s okay to share yours (anonymous or first name, your choice), let me know.")}
    `
  ),
  variant(
    "before_and_now",
    "Asks what's different for her now compared with when she started",
    () => "what's different now?",
    () => "Fifty debriefs later, what's changed?",
    (v) => `
      ${h1("Fifty debriefs later.")}
      ${hi(v)}
      ${para("Think back to when you first signed up. What&rsquo;s different now?")}
      ${para("Maybe you&rsquo;re on top of things you used to forget. Maybe you finally see what keeps eating your week. Maybe it&rsquo;s smaller than that. I&rsquo;d love to hear it, just hit reply.")}
      ${para("If you&rsquo;re open to us sharing it (anonymously or with your first name), say so and I&rsquo;ll make sure it&rsquo;s done right.")}
    `
  ),
]);
