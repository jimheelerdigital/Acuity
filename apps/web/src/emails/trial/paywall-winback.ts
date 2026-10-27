/**
 * Paywall win-back (2026-10-26, per Keenan: "do a better job winning people
 * back who leave the paywall"). Replaces the card-trial recovery emails
 * (recovery_checkout_abandoned / recovery_signup_no_checkout: 0 trials from
 * 109 sends Oct 12–26). Goes to people who reached a paywall (app hard
 * paywall or web funnel paywall/checkout) and left without starting a trial.
 *
 *   paywall_winback_1 — 5–10 min after leaving: their own first debrief back
 *                       (up to 3 to-dos + theme), "Start my free week".
 *   paywall_winback_2 — ~24h later: how the free week works, step by step.
 *   paywall_winback_3 — ~48h after #2: a plain note from Keenan asking what
 *                       stopped them (reply-to keenan@heelerdigital.com).
 *
 * The button goes to the app download (goripple.io/get: App Store on iPhone,
 * Google Play on Android, click logged), and she goes through the in-app
 * onboarding and paywall again (2026-10-27, Keenan: "push them right to app
 * download to re-go through the in app funnel"). Was a signed-in link
 * straight to the app's paywall. Two versions each, Jev picks
 * (lib/email-jev.ts).
 */
import { escapeHtml } from "@/lib/escape-html";
import { displayAnnual, displayMonthly } from "@/lib/pricing";

import { button, h1, hi, men, para, row, trialCard, variant, withVariants } from "./kit";
import type { TrialEmailTemplate, TrialVars } from "./types";

export function startUrl(v: TrialVars): string {
  return `${v.appUrl}/get?utm_source=email&utm_medium=email&utm_campaign=paywall_winback`;
}

const ZERO_TODAY = "$0 today. You see the date your free week ends before you confirm, and you can cancel any time before then.";

function tasksOf(v: TrialVars): string[] {
  return (v.firstDebriefTasks ?? []).filter((t) => t.trim()).slice(0, 3);
}

/** "3 to-dos" from the tasks we can quote, else the stored count. */
function taskCount(v: TrialVars): number {
  return Math.max(tasksOf(v).length, v.firstDebriefTaskCount ?? 0);
}

/** Her own first debrief, quoted back. Empty when there's nothing to quote. */
function yourDebriefCard(v: TrialVars): string {
  const tasks = tasksOf(v);
  if (!tasks.length && !v.topTheme) return "";
  return row(
    trialCard(`
    <p style="margin:0 0 10px;font-size:14px;font-weight:700;color:#C4451C;">From your first debrief:</p>
    ${tasks.length ? `<p style="margin:0 0 ${v.topTheme ? 12 : 0}px;font-size:15px;color:#374151;line-height:1.7;">${tasks.map((t) => `&#10003; ${escapeHtml(t)}`).join("<br/>")}</p>` : ""}
    ${v.topTheme ? `<p style="margin:0;font-size:15px;color:#374151;line-height:1.6;">What came up most: <strong>${escapeHtml(v.topTheme)}</strong></p>` : ""}
  `)
  );
}

/** For people who never got as far as a debrief (web funnel). */
function whatAWeekDoes(v: TrialVars): string {
  return men(v)
    ? "In a week, Ripple turns what you say into your to-do list, tracks the habits you&rsquo;re building, and sends a weekly report of what keeps coming up."
    : "In a week, Ripple turns what you say into your to-do list, tracks the habits you&rsquo;re building, and sends a weekly report of what changed and what keeps coming up.";
}

export const paywallWinback1: TrialEmailTemplate = withVariants([
  variant(
    "your_list_saved",
    "Her own to-dos from the first debrief, saved and waiting; start the free week to keep them",
    (v) => {
      const n = taskCount(v);
      return n > 0 ? `Your ${n} to-do${n === 1 ? " is" : "s are"} saved` : "Your Ripple is saved";
    },
    () => "Pick up where you left off. $0 today.",
    (v) => {
      const card = yourDebriefCard(v);
      return `
      ${h1(card ? "Your list is still here." : "Your Ripple is still here.")}
      ${hi(v)}
      ${card
        ? `${para("You did your first debrief and Ripple pulled this out of it:")}${card}${para("Start your free week and it keeps going: every debrief adds to your list, and by the end of the week you get a report of what keeps coming up.")}`
        : para(`You got right up to the end of setting up Ripple. ${whatAWeekDoes(v)}`)}
      ${para(ZERO_TODAY)}
      ${button(startUrl(v), "Start my free week")}
    `;
    }
  ),
  variant(
    "picked_up_on",
    "Leads with what Ripple noticed (theme or count), then the free week as the way to keep going",
    (v) => (v.topTheme ? `Ripple picked up on ${v.topTheme}` : "Ripple already started your list"),
    () => "One more step and it keeps going. $0 today.",
    (v) => {
      const card = yourDebriefCard(v);
      return `
      ${h1("You were one step away.")}
      ${hi(v)}
      ${card
        ? `${para("Here&rsquo;s what your first debrief turned into:")}${card}`
        : para(whatAWeekDoes(v))}
      ${para("The free week is where it gets useful: the more you say, the more Ripple can show you about your week.")}
      ${para(ZERO_TODAY)}
      ${button(startUrl(v), "Start my free week")}
    `;
    }
  ),
]);

function steps(): string {
  const monthly = displayMonthly();
  const annual = displayAnnual();
  return row(
    trialCard(`
    <p style="margin:0 0 12px;font-size:14px;font-weight:700;color:#C4451C;">How the free week works</p>
    <p style="margin:0;font-size:15px;color:#374151;line-height:1.9;">
      <strong>Today:</strong> $0. Full Ripple Pro.<br/>
      <strong>When you confirm:</strong> you see the exact date your free week ends.<br/>
      <strong>Day 7:</strong> your first charge, ${monthly}/month or ${annual}/year.<br/>
      <strong>Any time before that:</strong> cancel in 2 taps in Settings and pay nothing.
    </p>
  `)
  );
}

export const paywallWinback2: TrialEmailTemplate = withVariants([
  variant(
    "how_it_works",
    "Plain walkthrough of the free week: $0 today, the end date shown up front, charge on day 7, cancel any time",
    () => "How the free week works",
    () => "$0 today, cancel in 2 taps any time before day 7.",
    (v) => `
      ${h1("No surprises. Here&rsquo;s the whole thing.")}
      ${hi(v)}
      ${para("If the payment screen gave you pause, that&rsquo;s fair. Here&rsquo;s exactly what happens when you start the free week:")}
      ${steps()}
      ${para("By day 7 you&rsquo;ve had your first weekly report: what you got done, what keeps coming back, and how your week actually went. It&rsquo;s the clearest look at your week you&rsquo;ve had.")}
      ${button(startUrl(v), "Start my free week")}
    `
  ),
  variant(
    "first_report",
    "Leads with the first weekly report she'd get, then the free-week terms",
    () => "What your first week with Ripple looks like",
    () => "Your first weekly report lands before you pay anything.",
    (v) => `
      ${h1("Your first report comes before your first charge.")}
      ${hi(v)}
      ${para("Say what&rsquo;s on your plate a few times this week. Ripple keeps the list, tracks the habits, and at the end of the week shows you what changed and what keeps repeating.")}
      ${para("You see all of that before you&rsquo;re charged anything:")}
      ${steps()}
      ${button(startUrl(v), "Start my free week")}
    `
  ),
]);

export const paywallWinback3: TrialEmailTemplate = withVariants([
  variant(
    "what_stopped_you",
    "Short personal note from Keenan asking what stopped her, reply with one word",
    () => "can I ask you something?",
    () => "Just hit reply with one word.",
    (v) => `
      ${hi(v)}
      ${para("Keenan here, one of the founders of Ripple. You set Ripple up and then stopped at the free week. Can I ask what stopped you?")}
      ${para("Just hit reply with a word: <strong>price</strong>, <strong>not sure it&rsquo;d help</strong>, <strong>no time</strong>, or <strong>something else</strong>. I read every reply, and it genuinely changes what we build.")}
      ${para(`If you just got busy, it&rsquo;s still there: <a href="${startUrl(v)}" style="color:#C4451C;">start your free week</a>.`)}
    `
  ),
  variant(
    "honest_question",
    "Even shorter: one honest question, reply-to Keenan, quiet link",
    () => "quick question from Ripple",
    () => "What held you back? One word is plenty.",
    (v) => `
      ${hi(v)}
      ${para("Quick one. You got all the way to the free week and didn&rsquo;t start it. What held you back?")}
      ${para("Price, not sure it&rsquo;d help, no time, something else? Reply with whatever&rsquo;s true. It goes straight to me.")}
      ${para(`And if the timing just wasn&rsquo;t right, your free week is <a href="${startUrl(v)}" style="color:#C4451C;">here whenever you want it</a>.`)}
    `
  ),
]);
