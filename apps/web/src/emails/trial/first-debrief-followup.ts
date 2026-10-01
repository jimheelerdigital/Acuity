/**
 * After the first debrief (2026-10-01, per Keenan). ~20h after her first
 * recording, if she hasn't recorded a second one. Until now nothing went out
 * between the first debrief and stall_1rec at 48h, and push notifications
 * are off for new users, so email is the only nudge toward debrief #2, the
 * one where Ripple starts connecting things.
 * Sent by the recovery orchestrator. Three versions, Jev picks
 * (lib/email-jev.ts). Goal: she records a second debrief within 3 days.
 */
import { escapeHtml } from "@/lib/escape-html";
import { button, h1, hi, men, para, variant, withVariants } from "./kit";
import type { TrialEmailTemplate, TrialVars } from "./types";

const APP_LINK = "https://apps.apple.com/us/app/acuity-daily/id6762633410";

function caught(v: TrialVars): string {
  const n = v.firstDebriefTaskCount ?? 0;
  if (n > 1) return `Ripple pulled ${n} things out of your first debrief and put them on your list.`;
  if (n === 1) return "Ripple pulled a task out of your first debrief and put it on your list.";
  return "Ripple saved your first debrief and started your picture of what&rsquo;s going on.";
}

export const firstDebriefFollowup: TrialEmailTemplate = withVariants([
  variant(
    "what_it_caught",
    "Shows what Ripple caught from the first debrief, then asks for the second",
    () => "Here's what Ripple caught",
    () => "Your first debrief is on your list. The second one is where it gets interesting.",
    (v) => `
      ${h1("Here&rsquo;s what Ripple caught.")}
      ${hi(v)}
      ${para(caught(v))}
      ${para(v.topTheme ? `It also noticed <strong>${escapeHtml(v.topTheme)}</strong> coming up. One more debrief and it can start telling you whether that&rsquo;s a pattern or just a busy day.` : "One more debrief and it can start telling you what keeps coming up, not just what&rsquo;s on today&rsquo;s list.")}
      ${para(men(v) ? "Say what got done and what didn&rsquo;t. That&rsquo;s the whole second debrief." : "Say what got done, what didn&rsquo;t, and what&rsquo;s next. That&rsquo;s the whole second debrief.")}
      ${button(APP_LINK, "Open Ripple")}
    `
  ),
  variant(
    "second_connects",
    "The second debrief is when Ripple starts connecting things; keep it tiny",
    () => "The second one is where it clicks",
    () => "One debrief is a list. Two is the start of a pattern.",
    (v) => `
      ${h1("One is a list. Two is a pattern.")}
      ${hi(v)}
      ${para("Nice work on your first debrief. Here&rsquo;s the thing most people don&rsquo;t expect: Ripple gets much more useful on the second one, because now it has something to compare against.")}
      ${para("It doesn&rsquo;t need to be long. Tell it what moved since yesterday and what&rsquo;s still sitting there.")}
      ${button(APP_LINK, "Do your second debrief")}
    `
  ),
  variant(
    "how_was_it",
    "Personal note from Keenan asking how the first one felt, invites a reply",
    () => "how was your first one?",
    () => "And one small thing to try next.",
    (v) => `
      ${hi(v)}
      ${para("Saw you did your first debrief in Ripple. Thank you for giving it a real try.")}
      ${para(`${caught(v)} If something looked off, reply and tell me. I read every one.`)}
      ${para("If it felt good, do one more whenever something&rsquo;s on your mind. That&rsquo;s when Ripple starts noticing what keeps coming up for you.")}
      ${button(APP_LINK, "Open Ripple")}
    `
  ),
]);
