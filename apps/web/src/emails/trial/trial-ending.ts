/**
 * Trial-Ending Email — "Your Acuity trial ends in 2 days"
 *
 * Trigger: Active trial user whose trialEndsAt is ~2 days away, has
 *          at least 1 completed recording, has NOT paid, and has no
 *          card/payment method on file (stripeCustomerId is null,
 *          stripeSubscriptionId is null, no Apple/Google IAP).
 * Subject: "Your Acuity trial ends in 2 days"
 * From: Keenan from Acuity <keenan@getacuity.io> (set centrally in sendTrialEmail)
 *
 * Fires once per user. Single CTA to /upgrade. Copy assumes the user
 * HAS recorded (never-recorded users are excluded at the orchestrator).
 */

import { escapeHtml } from "@/lib/escape-html";
import { keenanSignature, primaryButton, trialLayout , para } from "./layout";
import type { TrialEmailTemplate, TrialVars } from "./types";


export const trialEnding: TrialEmailTemplate = {
  subject: () => "Your Acuity trial ends in 2 days",
  html: (v: TrialVars) => {
    const rawFirst = (v.firstName ?? "").trim();
    const greeting = rawFirst && rawFirst !== "friend"
      ? `Hi ${escapeHtml(rawFirst)},`
      : "Hi there,";

    const upgradeUrl = `${v.appUrl}/upgrade?src=trial_ending_email`;

    const content = `
      <tr>
        <td style="padding-bottom:24px;">
          <h1 style="margin:0;font-size:26px;font-weight:800;color:#1a1a1a;line-height:1.3;letter-spacing:-0.4px;">
            Your Acuity trial ends in 2 days
          </h1>
        </td>
      </tr>
      ${para(greeting)}
      ${para(`Quick heads-up: your free trial ends in two days.`)}
      ${para(`You\u2019ve already started building something here \u2014 a few debriefs in, Acuity is beginning to see the patterns in how your weeks actually go. That picture only gets sharper the longer you keep at it.`)}
      ${para(`If you\u2019d like to keep it going, you can set up your subscription anytime before the trial ends \u2014 $4.99/month, and you stay exactly where you left off. If now\u2019s not the right time, no pressure, and nothing happens automatically.`)}
      ${para(`Either way, the debriefs you\u2019ve recorded are yours.`)}
      <tr>
        <td style="padding-bottom:28px;">
          ${primaryButton(upgradeUrl, "Keep my subscription")}
        </td>
      </tr>
      ${keenanSignature()}
    `;

    return trialLayout({
      content,
      unsubscribeUrl: v.unsubscribeUrl,
      preheader: "A quick heads-up so nothing catches you off guard.",
    });
  },
};
