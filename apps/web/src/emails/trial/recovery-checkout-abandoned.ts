/**
 * Recovery Email 1 — Checkout Abandoned
 *
 * Trigger: User has funnel_checkout_started but no active subscription.
 *          30 minutes after abandonment.
 * Subject: "You were almost there"
 * From: Keenan at Acuity <hello@getacuity.io>
 *
 * Dynamic per diagnostic branch — the one-liner references what they
 * told us during the quiz to make it feel personal, not automated.
 */

import { escapeHtml } from "@/lib/escape-html";
import { keenanSignature, trialButton, trialLayout } from "./layout";
import type { TrialEmailTemplate, TrialVars } from "./types";

type Branch = "blur" | "patterns" | "rumination" | "graveyard" | "mask" | "drift";

const BRANCH_SUMMARIES: Record<Branch, string> = {
  blur: "your days have been blurring together",
  patterns: "the same argument keeps happening",
  rumination: "your brain won\u2019t quiet down at night",
  graveyard: "you\u2019ve tried other things and they didn\u2019t stick",
  mask: "you\u2019ve been holding it together on the outside",
  drift: "you feel like you\u2019re drifting from who you used to be",
};

function branchLine(v: TrialVars): string {
  const branch = (v as TrialVars & { branch?: string }).branch as Branch | undefined;
  return BRANCH_SUMMARIES[branch ?? "blur"] ?? BRANCH_SUMMARIES.blur;
}

function para(text: string): string {
  return `<tr><td style="padding-bottom:20px;"><p style="margin:0;font-size:16px;color:#374151;line-height:1.7;">${text}</p></td></tr>`;
}

export const recoveryCheckoutAbandoned: TrialEmailTemplate = {
  subject: () => "You were almost there",
  html: (v: TrialVars) => {
    const name = escapeHtml(v.firstName);
    const appUrl = escapeHtml(v.appUrl);
    const startUrl = `${appUrl}/start?utm_source=email&utm_medium=recovery&utm_campaign=checkout_abandoned`;

    const content = `
      <tr>
        <td style="padding-bottom:24px;">
          <h1 style="margin:0;font-size:26px;font-weight:800;color:#1a1a1a;line-height:1.3;letter-spacing:-0.4px;">
            You were almost there.
          </h1>
        </td>
      </tr>
      ${para(`Hey ${name},`)}
      ${para(`I\u2019m Keenan, one of the founders of Acuity.`)}
      ${para(`You went through our whole quiz. You told us ${branchLine(v)}. We built your insight profile.`)}
      ${para(`Then something stopped you at checkout. No pressure \u2014 but your profile is still here.`)}
      ${para(`7-day free trial. You won\u2019t be charged today. If it\u2019s not useful by Day 5, cancel with one tap.`)}
      <tr>
        <td style="padding-bottom:28px;">
          ${trialButton(startUrl, "Pick up where I left off")}
        </td>
      </tr>
      ${keenanSignature()}
    `;

    return trialLayout({
      content,
      unsubscribeUrl: v.unsubscribeUrl,
      preheader: "Your insight profile is still here. Pick up where you left off.",
    });
  },
};
