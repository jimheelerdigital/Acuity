/**
 * Recovery Email 2 — Signed Up But No Checkout
 *
 * Trigger: User has funnel_signup_completed but no funnel_checkout_started.
 *          1 hour after signup.
 * Subject: "Your insight profile is waiting"
 * From: Keenan from Acuity <keenan@getacuity.io> (set centrally in sendTrialEmail)
 */

import { escapeHtml } from "@/lib/escape-html";
import { MONTHLY_PRICE_CENTS, formatDollars } from "@/lib/pricing";
import { keenanSignature, trialButton, trialLayout , para } from "./layout";
import type { TrialEmailTemplate, TrialVars } from "./types";

type Branch = "overload" | "patterns" | "rumination" | "stuck" | "mask";

const BRANCH_SUMMARIES: Record<Branch, string> = {
  overload: "your days have been blurring together",
  patterns: "the same fights keep happening",
  rumination: "your mind won\u2019t stop replaying things",
  stuck: "you\u2019ve tried other things and they didn\u2019t stick",
  mask: "you keep it together on the outside but something\u2019s off",
};

function branchLine(v: TrialVars): string {
  const branch = (v as TrialVars & { branch?: string }).branch as Branch | undefined;
  return BRANCH_SUMMARIES[branch ?? "overload"] ?? BRANCH_SUMMARIES.overload;
}

const PRICE = formatDollars(MONTHLY_PRICE_CENTS);


export const recoverySignupNoCheckout: TrialEmailTemplate = {
  subject: () => "Your insight profile is waiting",
  html: (v: TrialVars) => {
    const name = escapeHtml(v.firstName);
    const appUrl = escapeHtml(v.appUrl);
    const startUrl = `${appUrl}/start?utm_source=email&utm_medium=recovery&utm_campaign=signup_no_checkout`;

    const content = `
      <tr>
        <td style="padding-bottom:24px;">
          <h1 style="margin:0;font-size:26px;font-weight:800;color:#1a1a1a;line-height:1.3;letter-spacing:-0.4px;">
            Your insight profile is waiting.
          </h1>
        </td>
      </tr>
      ${para(`Hey ${name},`)}
      ${para(`You told us ${branchLine(v)}. That took guts.`)}
      ${para(`We built a profile based on what you shared. It\u2019s ready \u2014 but you haven\u2019t started your trial yet.`)}
      ${para(`Here\u2019s what happens in the first week: you talk for 60 seconds a day. By Day 3, patterns start forming. By Day 7, you get a report that reads like someone who knows you wrote it. Because in a way, you did.`)}
      ${para(`${PRICE}/month after the free trial. Most people know by Day 3 whether it\u2019s worth it.`)}
      <tr>
        <td style="padding-bottom:28px;">
          ${trialButton(startUrl, "Start my free trial")}
        </td>
      </tr>
      ${keenanSignature()}
    `;

    return trialLayout({
      content,
      unsubscribeUrl: v.unsubscribeUrl,
      preheader: "You shared something real. Your profile is ready.",
    });
  },
};
