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
 * shorter shell consistently lands in spam for this domain.
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
    ? `You're Founding Member #${opts.foundingMemberNumber}. 30 days free, no card. If you're not into it in 2 weeks, delete the app and I'll buy your next coffee.`
    : `30 days free, no card required. If you're not into it in 2 weeks, delete the app and I'll buy your next coffee.`;

  const para = (text: string) =>
    `<tr><td style="padding-bottom:20px;"><p style="margin:0;font-size:16px;color:#D8D8E8;line-height:1.7;">${text}</p></td></tr>`;

  const content = `
      <tr>
        <td style="padding-bottom:20px;">
          <p style="margin:0;font-size:16px;color:#D8D8E8;line-height:1.7;">Hey ${name} —</p>
        </td>
      </tr>
      ${para("You're in. One quick step before you start: verify your email so you can sign in.")}
      <tr>
        <td style="padding-bottom:28px;">
          ${trialButton(verifyUrl, "Verify email")}
        </td>
      </tr>
      ${para("Once you're verified, here's what happens next:")}
      ${para("Open the app, hit record, and talk for 60 seconds. Whatever's in your head. Out loud. Don't try to make it smart.")}
      ${para("What you'll get back: a clean list of tasks Acuity pulled from what you said, the goals you mentioned (even in passing), and by Sunday, a 400-word narrative of your week that reads like someone was paying attention.")}
      ${para("Quick setup, then your first debrief.")}
      <tr>
        <td style="padding-bottom:4px;">
          <p style="margin:0;font-size:16px;color:#FFFFFF;font-weight:600;">— Jim &amp; Keenan</p>
        </td>
      </tr>
      <tr>
        <td style="padding-bottom:24px;">
          <p style="margin:0;font-size:13px;color:#A0A0B8;">Cofounders, Acuity</p>
        </td>
      </tr>
      <tr>
        <td>
          <p style="margin:0;font-size:14px;color:#A0A0B8;line-height:1.7;font-style:italic;">
            P.S. ${escapeHtml(fmLine)}
          </p>
        </td>
      </tr>
    `;

  return {
    subject: "Welcome to Acuity — verify your email",
    html: trialLayout({
      content,
      unsubscribeUrl: opts.unsubscribeUrl,
      preheader: "Tap the button to verify your email and start your first debrief.",
    }),
  };
}
