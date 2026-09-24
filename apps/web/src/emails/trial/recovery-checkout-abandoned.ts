/**
 * Recovery Email 1 — Checkout Abandoned
 *
 * Trigger: User has funnel_checkout_started but no active subscription.
 *          30 minutes after abandonment.
 * Subject: "You were almost there"
 * From: Keenan from Ripple <keenan@getacuity.io> (set centrally in sendTrialEmail)
 *
 * 2026-09-24: dropped the per-branch quiz line. TrialVars never carried the
 * branch, so every user got the "overload" line whatever they answered.
 * Links to /pro-trial (the funnel paywall, where the card trial lives).
 */

import { escapeHtml } from "@/lib/escape-html";
import { keenanSignature, trialButton, trialLayout , para } from "./layout";
import type { TrialEmailTemplate, TrialVars } from "./types";

export const recoveryCheckoutAbandoned: TrialEmailTemplate = {
  subject: () => "You were almost there",
  html: (v: TrialVars) => {
    const name = escapeHtml(v.firstName);
    const appUrl = escapeHtml(v.appUrl);
    const trialUrl = `${appUrl}/pro-trial?utm_source=email&utm_medium=recovery&utm_campaign=checkout_abandoned`;

    const content = `
      <tr>
        <td style="padding-bottom:24px;">
          <h1 style="margin:0;font-size:26px;font-weight:800;color:#1a1a1a;line-height:1.3;letter-spacing:-0.4px;">
            You were almost there.
          </h1>
        </td>
      </tr>
      ${para(`Hey ${name},`)}
      ${para(`I\u2019m Keenan, one of the founders of Ripple.`)}
      ${para(`You got as far as checkout and stopped. That\u2019s fine. Maybe the timing was off, or you wanted to think it over.`)}
      ${para(`Your free week of Pro is still waiting. $0 today, we email you before you\u2019re charged, and you can cancel anytime from your account.`)}
      ${para(`If something at checkout didn\u2019t work, just reply to this email and I\u2019ll sort it out myself.`)}
      <tr>
        <td style="padding-bottom:28px;">
          ${trialButton(trialUrl, "Start my free 7 days")}
        </td>
      </tr>
      ${keenanSignature()}
    `;

    return trialLayout({
      content,
      unsubscribeUrl: v.unsubscribeUrl,
      preheader: "Your free week of Pro is still waiting.",
    });
  },
};
