/**
 * Two-email reactivation sequence for Waitlist users who never created
 * a User account. Sent as a one-shot campaign from the admin dashboard.
 *
 * Uses the same trialLayout shell as the onboarding sequence for brand
 * consistency: dark canvas, #7C5CFC accent, Acuity logo header.
 */

import { trialLayout, trialButton } from "./trial/layout";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function p(text: string): string {
  return `<tr><td style="padding-bottom:20px;"><p style="margin:0;font-size:16px;color:#A0A0B8;line-height:1.7;">${text}</p></td></tr>`;
}

function sig(): string {
  return `<tr><td style="padding-bottom:0;"><p style="margin:0;font-size:16px;color:#FFFFFF;font-weight:600;">— Keenan</p><p style="margin:4px 0 0;font-size:14px;color:#A0A0B8;">Founder, Acuity</p></td></tr>`;
}

// ─── Email 1 ────────────────────────────────────────────────────────

export function waitlistReactivation1Subject(firstName: string): string {
  return `Acuity is live, ${firstName} — and you're in`;
}

export function waitlistReactivation1Html(opts: {
  firstName: string;
  signupUrl: string;
  unsubscribeUrl: string;
}): string {
  const name = escapeHtml(opts.firstName);
  const content = `
    ${p(`Hey ${name} —`)}
    ${p(
      `You signed up for the Acuity waitlist a while back. The wait's over — Acuity is live, and your spot is held.`
    )}
    ${p(
      `What it does: you talk for 60 seconds, any time of day. Acuity catches the tasks you mentioned, the goals you keep circling, and by Sunday morning, writes you a 400-word narrative of your week that reads like someone was paying attention.`
    )}
    ${p(
      `Because you signed up early, you get 30 days free instead of 14. No card required. If you don't love it, delete it and I'll buy your next coffee.`
    )}
    <tr><td style="padding-bottom:24px;">${trialButton(opts.signupUrl, "Claim Your 30-Day Trial")}</td></tr>
    ${sig()}
    ${p(
      `<span style="font-size:14px;color:#666;">P.S. The first 100 members lock in 30 days free permanently. There are still spots left, but they're going fast.</span>`
    )}
  `;

  return trialLayout({
    content,
    unsubscribeUrl: opts.unsubscribeUrl,
    preheader: "The wait is over — your 30-day free trial is ready.",
  });
}

// ─── Email 2 ────────────────────────────────────────────────────────

export function waitlistReactivation2Subject(): string {
  return "Last call on your Founding Member spot";
}

export function waitlistReactivation2Html(opts: {
  firstName: string;
  signupUrl: string;
  unsubscribeUrl: string;
}): string {
  const name = escapeHtml(opts.firstName);
  const content = `
    ${p(`Hey ${name} —`)}
    ${p(
      `Quick follow-up. You signed up for the Acuity waitlist but haven't claimed your spot yet.`
    )}
    ${p(
      `Here's what I want to be honest about: the Founding Member offer (30 days free, locked in forever) only goes to the first 100 people. We're closing in on that. Once it caps, new signups get the standard 14-day trial and that's it.`
    )}
    ${p(
      `If you're not interested anymore, I get it — you can ignore this email and I won't send another. But if you signed up because something about it caught you, this is the moment.`
    )}
    <tr><td style="padding-bottom:24px;">${trialButton(opts.signupUrl, "Start My 30-Day Trial")}</td></tr>
    ${sig()}
    ${p(
      `<span style="font-size:14px;color:#666;">P.S. If you reply and tell me what's holding you back, I read every one. Sometimes it helps me fix something. Sometimes it helps you decide.</span>`
    )}
  `;

  return trialLayout({
    content,
    unsubscribeUrl: opts.unsubscribeUrl,
    preheader: "Your Founding Member spot expires soon.",
  });
}
