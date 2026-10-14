/**
 * Win-back free month (2026-10-14, per Keenan: "send out a 'free month'
 * email to every single user on our end that's churned. ask them what the
 * app lacked, why they stopped using it, and what prevented it from being
 * their go-to app").
 *
 * One email, sent by scripts/free-month-winback-send.ts to free-plan
 * accounts that had Pro before (lib/free-month.ts FREE_MONTH_ELIGIBLE_WHERE).
 * The three questions are answered by replying (reply-to is Keenan). The
 * button opens /free-month, which starts 30 days of Pro with no card.
 *
 * Voice per docs/acuity-positioning.md: on her side, plain, never preachy.
 * "Debrief" for the feature. No time of day, no prices.
 */

import { escapeHtml } from "@/lib/escape-html";
import { keenanSignature, para, primaryButton, trialLayout } from "@/emails/trial/layout";

export interface FreeMonthWinbackVars {
  firstName: string | null;
  claimUrl: string;
  unsubscribeUrl: string;
}

function question(n: number, text: string): string {
  return `<tr><td style="padding-bottom:10px;"><p style="margin:0;font-size:16px;color:#1a1a1a;line-height:1.6;"><span style="display:inline-block;width:26px;font-weight:800;color:#E06B46;">${n}.</span>${text}</p></td></tr>`;
}

export function freeMonthWinback(v: FreeMonthWinbackVars): { subject: string; html: string } {
  const rawFirst = (v.firstName ?? "").trim();
  const greeting = rawFirst && rawFirst.toLowerCase() !== "friend" ? `Hi ${escapeHtml(rawFirst)},` : "Hi there,";

  const content = `
      <tr>
        <td style="padding-bottom:20px;">
          <h1 style="margin:0;font-size:28px;font-weight:800;color:#1a1a1a;line-height:1.25;letter-spacing:-0.5px;">
            A free month, and three questions
          </h1>
        </td>
      </tr>
      ${para(greeting)}
      ${para("Keenan here, one of the two founders of Ripple. You gave Ripple a try, and it didn&rsquo;t stick. I&rsquo;d rather ask you why than guess.")}
      ${para("If you have two minutes, hit reply and tell me:")}
      ${question(1, "What did the app lack?")}
      ${question(2, "Why did you stop using it?")}
      ${question(3, "What kept it from becoming your go-to app?")}
      <tr><td style="padding-bottom:10px;"></td></tr>
      ${para("A line or two is plenty. I read every reply myself, and what you say goes straight into what we build next.")}
      ${para("Whether you reply or not, here&rsquo;s a free month of Pro on us. No card, nothing to cancel. When the month ends you go back to the free plan unless you decide to keep it.")}
      <tr>
        <td style="padding-bottom:24px;">
          ${primaryButton(v.claimUrl, "Start my free month")}
        </td>
      </tr>
      ${para("A lot has changed since you last opened it. Ripple now answers to Siri, sits on your Home Screen, and lets you ask questions about your own past debriefs and see exactly where the answer came from.")}
      ${para("Thanks for giving us a shot the first time.")}
      ${keenanSignature()}
    `;

  return {
    subject: "A free month of Ripple, and 3 quick questions",
    html: trialLayout({
      content,
      footer: "marketing",
      unsubscribeUrl: v.unsubscribeUrl,
      preheader: "On us, no card. And I'd love to know what we got wrong.",
    }),
  };
}
