/**
 * Day-2 come-back nudge, email form (2026-10-18, audit R-3, per Keenan).
 *
 * The email twin of the day-2 push in lib/v10-day2-push.ts, for the users
 * who never registered a device. Same subject as the push title, one line
 * of body, one button. Sent once, by the hourly day-2 cron, only to people
 * with no pushToken who haven't recorded since their first day.
 *
 * Copy rules: "debrief" (never "brain dump" in product mail), no
 * time-of-day words, no duration claims, no therapy claims. No name
 * interpolation in the subject and nothing quoted back from what she
 * recorded — same reasoning as the push.
 *
 * The button goes to the recorder:
 *   - app users (OnboardingEvent app_signed_in): a one-tap signed-in link
 *     that opens the app on the recorder (lib/app-access.ts, next=record)
 *   - web-only users: /home#record on the web app
 */
import { button, h1, hi, para, variant, withVariants } from "./kit";
import type { TrialEmailTemplate, TrialVars } from "./types";

export const DAY2_NUDGE_SUBJECT = "Anything still taking up space?";

function recorderUrl(v: TrialVars): string {
  return v.signInUrl || `${v.appUrl}/home#record`;
}

export const day2Nudge: TrialEmailTemplate = withVariants([
  variant(
    "say_it_once",
    "The push copy, as an email: say it once, Ripple keeps track",
    () => DAY2_NUDGE_SUBJECT,
    () => "Say it once. Ripple will keep track.",
    (v) => `
      ${h1("Anything still taking up space?")}
      ${hi(v)}
      ${para("Say it once in a debrief and Ripple will keep track of it for you.")}
      ${button(recorderUrl(v), "Do a debrief")}
    `
  ),
]);
