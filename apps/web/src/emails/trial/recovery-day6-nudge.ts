/**
 * Recovery Email 5 — Day 6 Nudge (Pre-Weekly-Report)
 *
 * Trigger: User has 3+ recordings, Day 6 of trial (Saturday).
 *          Their weekly report generates tomorrow.
 * Subject: "Your first report arrives tomorrow"
 * From: Keenan from Acuity <keenan@getacuity.io> (set centrally in sendTrialEmail)
 */

import { escapeHtml } from "@/lib/escape-html";
import { keenanSignature, trialButton, trialLayout , para } from "./layout";
import type { TrialEmailTemplate, TrialVars } from "./types";

const APP_STORE_URL = "https://apps.apple.com/us/app/acuity-daily/id6762633410";


export const recoveryDay6Nudge: TrialEmailTemplate = {
  subject: () => "Your first report arrives tomorrow",
  html: (v: TrialVars) => {
    const name = escapeHtml(v.firstName);

    const content = `
      <tr>
        <td style="padding-bottom:24px;">
          <h1 style="margin:0;font-size:26px;font-weight:800;color:#1a1a1a;line-height:1.3;letter-spacing:-0.4px;">
            Your first report arrives tomorrow.
          </h1>
        </td>
      </tr>
      ${para(`Hey ${name},`)}
      ${para(`Tomorrow morning, you\u2019ll get your first weekly report.`)}
      ${para(`It\u2019s a 400-word narrative of your week \u2014 written from everything you told Ripple this week. Patterns you mentioned without noticing. Tasks that kept coming up. How your mood shifted day to day.`)}
      ${para(`One more entry today will make it sharper. Even 60 seconds.`)}
      <tr>
        <td style="padding-bottom:28px;">
          ${trialButton(APP_STORE_URL, "Record today\u2019s entry")}
        </td>
      </tr>
      ${keenanSignature()}
    `;

    return trialLayout({
      content,
      unsubscribeUrl: v.unsubscribeUrl,
      preheader: "Your weekly report generates tomorrow. One more entry makes it sharper.",
    });
  },
};
