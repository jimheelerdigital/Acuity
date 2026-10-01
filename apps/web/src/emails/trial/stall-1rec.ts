/**
 * Stall Re-engagement — Email A (1 recording, 48h silent)
 *
 * Trigger: User has exactly 1 completed recording AND 48h+ since
 *          their last (only) recording. Replaces the old
 *          "recorded once went quiet" email.
 *
 * Links to the app (App Store link opens the installed app) + web /home.
 *
 * 2026-10-01: three versions, Jev picks (lib/email-jev.ts). Goal: she records
 * her second debrief within 3 days.
 */
import { escapeHtml } from "@/lib/escape-html";
import { button, h1, hi, men, para, variant, webLink, withVariants } from "./kit";
import type { TrialEmailTemplate, TrialVars } from "./types";

const APP_LINK = "https://apps.apple.com/us/app/acuity-daily/id6762633410";

function firstTasks(v: TrialVars): string {
  return v.firstDebriefTaskCount
    ? para(`Your first debrief turned into ${v.firstDebriefTaskCount} task${v.firstDebriefTaskCount === 1 ? "" : "s"}. Tell Ripple which ones you&rsquo;ve done and what&rsquo;s new.`)
    : "";
}

export const stall1rec: TrialEmailTemplate = withVariants([
  variant(
    "second_one_connects",
    "The second debrief is when Ripple starts connecting the dots",
    () => "The second one is where it starts",
    () => "One debrief is a moment. Two is the start of a pattern.",
    (v) => `
      ${h1("The second one is where it starts.")}
      ${hi(v)}
      ${para("You recorded your first debrief a couple of days ago. On its own, that&rsquo;s a moment. The second one is when Ripple can start connecting the dots: what&rsquo;s still on your list, what changed, what keeps coming up.")}
      ${firstTasks(v)}
      ${button(APP_LINK, "Open Ripple")}
      ${webLink(v, "Use the web version")}
    `
  ),
  variant(
    "quick_update",
    "Tiny ask: a quick update on what got done and what's next",
    () => "Quick update?",
    () => "What got done, what's still hanging. Ripple keeps track.",
    (v) => `
      ${h1("Give Ripple a quick update.")}
      ${hi(v)}
      ${para("Your second debrief doesn&rsquo;t need to be big. Just: what got done, what&rsquo;s still hanging, what&rsquo;s new.")}
      ${firstTasks(v)}
      ${para(men(v) ? "&ldquo;Hit the gym twice, still haven&rsquo;t made that call, and I want to stop skipping breakfast.&rdquo; That&rsquo;s plenty." : "&ldquo;Got the dentist booked, still need to sort the permission slip, and the week&rsquo;s been a lot.&rdquo; That&rsquo;s plenty.")}
      ${button(APP_LINK, "Open Ripple")}
      ${webLink(v, "Use the web version")}
    `
  ),
  variant(
    "how_was_the_first",
    "Personal note asking how the first debrief felt; invites a reply",
    () => "how was your first one?",
    () => "Tell me, or tell Ripple what happened since.",
    (v) => `
      ${hi(v)}
      ${para("You tried Ripple a couple of days ago. How did it feel? If anything was off, reply and tell me. I read every one.")}
      ${para("If it was fine and life just got busy, that&rsquo;s normal. Open the app next time something&rsquo;s on your mind and pick up where you left off.")}
      ${v.topTheme ? para(`Ripple already picked up on <strong>${escapeHtml(v.topTheme)}</strong>. It&rsquo;ll show you more once it hears from you again.`) : ""}
      ${button(APP_LINK, "Open Ripple")}
      ${webLink(v, "Use the web version")}
    `
  ),
]);
