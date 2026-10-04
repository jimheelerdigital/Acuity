/**
 * Day 5 of a CARD trial (2026-10-04, weekly audit #1). Until now card
 * trialists got nothing in their last days except Stripe's billing reminder
 * (the trial_ending / never_recorded_3day emails only go to cardless trials).
 *   card_trial_week_so_far — recorded at least once: what Ripple has caught,
 *                            keep going. Goal: records again.
 *   card_trial_try_once    — never recorded: one honest nudge with the one-tap
 *                            signed-in link (APP_ACCESS_EMAIL_KEYS). Goal: records.
 * Sent by the recovery orchestrator ~2 days before the trial ends. Three
 * versions each, Jev picks (lib/email-jev.ts).
 */
import { escapeHtml } from "@/lib/escape-html";
import { appBlock, button, exampleCard, h1, hi, men, para, variant, withVariants } from "./kit";
import type { TrialEmailTemplate, TrialVars } from "./types";

const APP_LINK = "https://apps.apple.com/us/app/acuity-daily/id6762633410";

function soFar(v: TrialVars): string {
  const n = v.totalRecordings;
  const debriefs = n === 1 ? "one debrief" : `${n} debriefs`;
  const theme = v.topTheme ? ` The thing that keeps coming up so far: <strong>${escapeHtml(v.topTheme)}</strong>.` : "";
  return `You&rsquo;ve done ${debriefs} this week.${theme}`;
}

export const cardTrialWeekSoFar: TrialEmailTemplate = withVariants([
  variant(
    "week_so_far",
    "Recap of what Ripple has caught this week, then one more debrief",
    () => "Your week so far",
    () => "Here's what Ripple has picked up, and how to get more out of it.",
    (v) => `
      ${h1("Your week so far")}
      ${hi(v)}
      ${para(soFar(v))}
      ${para("Every debrief adds to the picture. One more before the weekend and Ripple can start telling you what&rsquo;s a pattern and what was just a busy day.")}
      ${button(APP_LINK, "Open Ripple")}
    `
  ),
  variant(
    "whats_next",
    "Forward-looking: say what's coming up next week, Ripple turns it into a list",
    () => "What's on next week?",
    () => "Talk through next week and it's a list before Monday.",
    (v) => `
      ${hi(v)}
      ${para(soFar(v))}
      ${para(men(v) ? "Try this next: tell Ripple what&rsquo;s coming up next week. Training, deadlines, the calls you keep pushing. It turns it into your list before Monday." : "Try this next: tell Ripple what&rsquo;s coming up next week. Appointments, school things, work, the calls you keep pushing. It turns it into your list before Monday.")}
      ${button(APP_LINK, "Open Ripple")}
    `
  ),
  variant(
    "personal_check",
    "Short personal check-in from Keenan asking how it's going, invites a reply",
    () => "how's it going so far?",
    () => "Quick question from me.",
    (v) => `
      ${hi(v)}
      ${para(`${soFar(v)} Thank you for actually using it.`)}
      ${para("Is it helping? If something feels off or missing, reply and tell me. I read every one, and it shapes what we build next.")}
      ${button(APP_LINK, "Open Ripple")}
    `
  ),
]);

export const cardTrialTryOnce: TrialEmailTemplate = withVariants([
  variant(
    "try_once_honest",
    "Honest: your free week ends soon, try it once so you know if it's worth keeping",
    (v) => `Before your free week ends ${v.trialEndsAt}`,
    () => "Try it once so you know if it's worth keeping.",
    (v) => `
      ${h1("Try it once before your free week ends")}
      ${hi(v)}
      ${para(`Your free week runs until ${escapeHtml(v.trialEndsAt)}, and you haven&rsquo;t done a debrief yet. I&rsquo;d rather you try it once and decide than keep paying for something you never opened.`)}
      ${exampleCard(v)}
      ${appBlock(v)}
    `
  ),
  variant(
    "one_tap_in",
    "Removes friction: one tap opens the app signed in, then one sentence",
    () => "One tap and you're in",
    () => "Ripple opens signed in. Then just say one thing.",
    (v) => `
      ${hi(v)}
      ${para("The button below opens Ripple already signed into your account, so there&rsquo;s nothing to set up. Then tap record and say one thing you keep meaning to do.")}
      ${appBlock(v)}
      ${para("That&rsquo;s the whole first step. Ripple turns it into your list and starts tracking it.")}
    `
  ),
  variant(
    "what_got_in_the_way",
    "Assumes something got in the way, offers help by reply, plus the link",
    () => "did something get in the way?",
    () => "If Ripple isn't working for you, I want to know.",
    (v) => `
      ${hi(v)}
      ${para("You started a free week of Ripple but haven&rsquo;t recorded yet. Usually that means the app was hard to get into, you weren&rsquo;t sure what to say, or the week got away from you.")}
      ${para("If it&rsquo;s the first, this button opens it signed in. If it&rsquo;s the second, just say what&rsquo;s on your plate. If it&rsquo;s anything else, reply and tell me.")}
      ${appBlock(v)}
    `
  ),
]);
