/**
 * Combined welcome + verify email for email/password signup.
 *
 * Replaces the prior dual-email firing pattern (verification.ts +
 * trial/welcome-day0.ts both going out on signup, with the short
 * transactional verification.ts consistently landing in spam while
 * the conversational welcome-day0 landed in inbox).
 *
 * Why one email beats two:
 *   - Spam filters heavily weight short "verify your account" emails,
 *     especially on domains without strict SPF. getacuity.io has DKIM
 *     + DMARC but no SPF as of 2026-05-12 — SPF fix is DNS-side and
 *     filed as a separate launch-blocker.
 *   - One email = one inbox decision; the user can't "click the wrong
 *     one" (which is what happened on the 2026-05-12 signup test —
 *     user clicked welcome-day0's CTA expecting it to verify).
 *
 * Layout deliberately uses the trial-email shell (richer HTML, longer
 * body, brand styling) instead of the minimal auth-email shell — the
 * shorter shell consistently lands in spam for this domain. We pass
 * footer:"transactional" so the richer shell keeps deliverability but
 * drops the marketing unsubscribe (this is an at-signup auth email).
 *
 * Stays in @/emails (not @/emails/trial) because it isn't part of the
 * orchestrated trial sequence — it's the at-signup transactional with
 * onboarding copy bundled in.
 */

import { escapeHtml } from "@/lib/escape-html";
import { trialButton, trialLayout } from "./trial/layout";

export interface WelcomeVerifyOpts {
  firstName: string;
  verifyUrl: string;
  unsubscribeUrl: string;
  /** Optional founding-member rank to surface in the P.S. */
  foundingMemberNumber?: number | null;
}

export function welcomeVerifyEmail(
  opts: WelcomeVerifyOpts
): { subject: string; html: string } {
  const name = escapeHtml(opts.firstName);
  const verifyUrl = escapeHtml(opts.verifyUrl);
  const fmLine = opts.foundingMemberNumber
    ? `You're Founding Member #${opts.foundingMemberNumber}. 7 days free, no card. If it's not for you, delete the app and I'll buy your next coffee.`
    : `7 days free, no card required. If it's not for you, delete the app and I'll buy your next coffee.`;

  const para = (text: string) =>
    `<tr><td style="padding-bottom:20px;"><p style="margin:0;font-size:16px;color:#374151;line-height:1.7;">${text}</p></td></tr>`;

  const content = `
      <tr>
        <td style="padding-bottom:20px;">
          <p style="margin:0;font-size:16px;color:#374151;line-height:1.7;">Hey ${name} —</p>
        </td>
      </tr>
      ${para("You're in. One quick step before you start: verify your email so you can sign in.")}
      <tr>
        <td style="padding-bottom:28px;">
          ${trialButton(verifyUrl, "Verify email")}
        </td>
      </tr>
      ${para("Once you're verified, here's how it works. Open the app, press record, and say whatever's on your mind. No script, no tidying it up first. Just a short debrief, out loud.")}
      ${para("Ripple listens and gives it back to you in a form you can use: the tasks hidden in what you said, the things you care about, where your mood is sitting, and how the different parts of your life are tracking. By the weekend, a weekly report that reads like someone was actually paying attention.")}
      ${para("That's the whole thing. A few spoken minutes, and you get to see yourself a little more clearly.")}
      <tr>
        <td style="padding-bottom:4px;">
          <p style="margin:0;font-size:16px;color:#1a1a1a;font-weight:600;">— Jim &amp; Keenan</p>
        </td>
      </tr>
      <tr>
        <td style="padding-bottom:24px;">
          <p style="margin:0;font-size:13px;color:#6b7280;">Cofounders, Ripple</p>
        </td>
      </tr>
      <tr>
        <td>
          <p style="margin:0;font-size:14px;color:#6b7280;line-height:1.7;font-style:italic;">
            P.S. ${escapeHtml(fmLine)}
          </p>
        </td>
      </tr>
    `;

  return {
    subject: "Welcome to Ripple — verify your email",
    html: trialLayout({
      content,
      footer: "transactional",
      preheader: "Verify your email and start your first debrief.",
    }),
  };
}
