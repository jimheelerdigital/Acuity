/**
 * Milestone Email — 100 Recordings
 *
 * Referral nudge + product feedback ask.
 * Reply-to: keenan@getacuity.io.
 *
 * 2026-10-01: three versions, Jev picks (lib/email-jev.ts). Goal: she passes
 * Ripple on / replies with feedback (counted as clicks when present).
 */
import { h1, hi, men, para, variant, withVariants } from "./kit";
import type { TrialEmailTemplate } from "./types";

export const milestone100: TrialEmailTemplate = withVariants([
  variant(
    "pass_it_on",
    "Thanks her for 100 debriefs and asks her to pass Ripple to one person",
    () => "100 debriefs. Thank you",
    () => "A hundred debriefs. One small ask.",
    (v) => `
      ${h1("A hundred debriefs.")}
      ${hi(v)}
      ${para("That&rsquo;s rare, and it&rsquo;s the whole reason Ripple exists. Thank you.")}
      ${para(men(v) ? "One small ask: if there&rsquo;s someone in your life who&rsquo;s always saying he&rsquo;ll get on top of things next week, send him Ripple. It helps us grow, and it might help him." : "One small ask: if there&rsquo;s someone in your life who&rsquo;s carrying a lot and always saying she needs to get organized, send her Ripple. It helps us grow, and it might help her.")}
      ${para("And I&rsquo;d love to know what keeps you coming back. Hit reply.")}
    `
  ),
  variant(
    "make_it_better",
    "Leads with a feedback ask: she knows Ripple best, how should it get better",
    () => "you know Ripple better than we do",
    () => "100 debriefs in. What should we build next?",
    (v) => `
      ${hi(v)}
      ${para("A hundred debriefs. At this point you probably know Ripple better than we do.")}
      ${para("So let me ask directly: what&rsquo;s the main reason you use it, and what would make it better? Reply with anything, big or small. Feedback from people like you carries the most weight.")}
      ${para("And if someone you know would get something out of it, passing it along is the best thank-you there is.")}
    `
  ),
  variant(
    "who_comes_to_mind",
    "Asks who came to mind first, framed as helping someone she cares about",
    () => "who comes to mind?",
    () => "Someone you know would probably like this.",
    (v) => `
      ${h1("Who comes to mind?")}
      ${hi(v)}
      ${para("A hundred debriefs. Thank you for making Ripple part of your weeks.")}
      ${para("When you think about who else could use this, someone probably comes to mind right away. If you send them Ripple, it&rsquo;s the biggest help a small team like ours can get.")}
      ${para("And if there&rsquo;s anything you&rsquo;d change about it, reply and tell me. I read every one.")}
    `
  ),
]);
