/**
 * Stall Re-engagement — Email B (2 recordings, 48h silent)
 *
 * Trigger: User has exactly 2 completed recordings AND 48h+ since
 *          their last recording.
 *
 * Links to the app (App Store link opens the installed app) + web /home.
 *
 * 2026-10-01: three versions, Jev picks (lib/email-jev.ts). Goal: she records
 * her third debrief within 3 days.
 */
import { escapeHtml } from "@/lib/escape-html";
import { button, h1, hi, men, para, variant, webLink, withVariants } from "./kit";
import type { TrialEmailTemplate } from "./types";

const APP_LINK = "https://apps.apple.com/us/app/acuity-daily/id6762633410";

export const stall2rec: TrialEmailTemplate = withVariants([
  variant(
    "right_before_good_part",
    "She's right at the point where patterns start showing up",
    () => "Right before the good part",
    () => "Two debriefs in. One more and Ripple starts handing things back.",
    (v) => `
      ${h1("You&rsquo;re right before the good part.")}
      ${hi(v)}
      ${para("Two debriefs is enough for Ripple to start noticing things. One more and it starts handing them back: what you keep mentioning, what&rsquo;s still on the list, where your week went.")}
      ${para("Pick up wherever you left off. Open the app and tap record.")}
      ${button(APP_LINK, "Open Ripple")}
      ${webLink(v, "Use the web version")}
    `
  ),
  variant(
    "theme_tease",
    "Teases the theme Ripple already noticed and asks for more",
    (v) => (v.topTheme ? `Ripple noticed something: ${v.topTheme}` : "Ripple is starting to notice things"),
    () => "Keep talking and it'll show you how often it comes up.",
    (v) => `
      ${h1("Ripple is starting to notice things.")}
      ${hi(v)}
      ${v.topTheme ? para(`From your first two debriefs, one thing stands out: <strong>${escapeHtml(v.topTheme)}</strong>.`) : para("From your first two debriefs, a few themes are starting to take shape.")}
      ${para("Your next debrief tells Ripple whether that&rsquo;s a one-off or something that keeps coming up. That&rsquo;s where the useful stuff starts.")}
      ${button(APP_LINK, "Open Ripple")}
      ${webLink(v, "Use the web version")}
    `
  ),
  variant(
    "streak_restart",
    "Low-pressure restart: no streak lost, just say what's happened since",
    () => "Nothing lost. Pick it back up.",
    () => "Tell Ripple what's happened since your last one.",
    (v) => `
      ${h1("Nothing lost. Pick it back up.")}
      ${hi(v)}
      ${para("A few quiet days don&rsquo;t undo anything. Everything you said is still there, and your list is waiting.")}
      ${para(men(v) ? "Open Ripple and tell it what&rsquo;s happened since: what you got done, what you skipped, what&rsquo;s next." : "Open Ripple and tell it what&rsquo;s happened since: what got done, what didn&rsquo;t, what&rsquo;s on your mind now.")}
      ${button(APP_LINK, "Open Ripple")}
      ${webLink(v, "Use the web version")}
    `
  ),
]);
