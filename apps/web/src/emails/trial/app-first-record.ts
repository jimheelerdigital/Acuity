/**
 * "You're in the app, now say one thing" (2026-09-29, per Keenan: paid web
 * buyers were signing into the app and then never recording). The app's home
 * screen for a new paid user is just "No entries yet. Tap the record button
 * above to start" (changing it needs an app update), so these emails do the
 * guiding: a concrete first thing to say and what Ripple does with it.
 *   app_first_record_1 — ~1h after first app sign-in, still 0 recordings
 *   app_first_record_2 — ~1 day later, still 0 recordings
 * Sent by the recovery orchestrator. Include the backup sign-in link
 * (APP_ACCESS_EMAIL_KEYS) in case they were signed out.
 */
import { escapeHtml } from "@/lib/escape-html";
import { appAccessBlock, keenanSignature, trialLayout, para, trialCard } from "./layout";
import type { TrialEmailTemplate, TrialVars } from "./types";

function exampleCard(): string {
  return trialCard(`
    <p style="margin:0 0 10px;font-size:14px;font-weight:700;color:#C4451C;">Say something like:</p>
    <p style="margin:0 0 14px;font-size:16px;color:#1a1a1a;line-height:1.6;font-style:italic;">&ldquo;I need to call the dentist, the report is due Thursday, and I want to get to the gym twice this week.&rdquo;</p>
    <p style="margin:0 0 6px;font-size:14px;font-weight:700;color:#C4451C;">Ripple gives you back:</p>
    <p style="margin:0;font-size:15px;color:#374151;line-height:1.7;">&#10003; Call the dentist<br/>&#10003; Finish the report &middot; Thursday<br/>&#10003; Habit: gym, 2x this week</p>
  `);
}

function backupSignIn(v: TrialVars): string {
  if (!v.signInUrl) return "";
  return `${para("Signed out, or on a new phone? This opens Ripple signed in:")}<tr><td style="padding-bottom:20px;">${appAccessBlock(v)}</td></tr>`;
}

export const appFirstRecord1: TrialEmailTemplate = {
  subject: () => "You're in. Here's your first one",
  html: (v: TrialVars) => {
    const first = (v.firstName ?? "").trim();
    const content = `
      <tr><td style="padding-bottom:24px;"><h1 style="margin:0;font-size:26px;font-weight:800;color:#1a1a1a;line-height:1.3;">You&rsquo;re in. Now say one thing.</h1></td></tr>
      ${para(first ? `Hi ${escapeHtml(first)},` : "Hi there,")}
      ${para("You&rsquo;re signed into Ripple. The fastest way to see what it does: open the app, tap the big record button at the top, and tell it three things on your plate this week. No typing, no right way to do it.")}
      <tr><td style="padding-bottom:20px;">${exampleCard()}</td></tr>
      ${para("That&rsquo;s it. Your list is ready, your habits start tracking, and by the end of the week Ripple shows you what kept coming up.")}
      ${backupSignIn(v)}
      ${keenanSignature()}
    `;
    return trialLayout({ content, unsubscribeUrl: v.unsubscribeUrl, preheader: "Open Ripple, tap record, and say three things on your plate." });
  },
};

export const appFirstRecord2: TrialEmailTemplate = {
  subject: () => "Still one tap away",
  html: (v: TrialVars) => {
    const first = (v.firstName ?? "").trim();
    const content = `
      <tr><td style="padding-bottom:24px;"><h1 style="margin:0;font-size:26px;font-weight:800;color:#1a1a1a;line-height:1.3;">Your first one takes one tap.</h1></td></tr>
      ${para(first ? `Hi ${escapeHtml(first)},` : "Hi there,")}
      ${para("You haven&rsquo;t recorded anything in Ripple yet, which means it hasn&rsquo;t had a chance to help. Next time something&rsquo;s on your mind, in the car, walking, between things, open the app and tap record. Say it however it comes out.")}
      <tr><td style="padding-bottom:20px;">${exampleCard()}</td></tr>
      ${para("If something isn&rsquo;t working or you&rsquo;re not sure what to say, just reply. I read every one.")}
      ${backupSignIn(v)}
      ${keenanSignature()}
    `;
    return trialLayout({ content, unsubscribeUrl: v.unsubscribeUrl, preheader: "Tap record and say what's on your plate. Ripple does the rest." });
  },
};
