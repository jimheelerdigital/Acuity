/**
 * Recovery Email 4 — Recorded Once, Never Returned
 *
 * Trigger: User has 1 recording but none in the last 48 hours.
 *          48 hours after first recording.
 * Subject: "Your second entry changes everything"
 * From: Keenan at Acuity <hello@getacuity.io>
 */

import { escapeHtml } from "@/lib/escape-html";
import { trialButton, trialLayout } from "./layout";
import type { TrialEmailTemplate, TrialVars } from "./types";

const APP_STORE_URL = "https://apps.apple.com/app/acuity-daily-debrief/id6738030875";

function para(text: string): string {
  return `<tr><td style="padding-bottom:20px;"><p style="margin:0;font-size:16px;color:#374151;line-height:1.7;">${text}</p></td></tr>`;
}

export const recoveryRecordedOnce: TrialEmailTemplate = {
  subject: () => "Your second entry changes everything",
  html: (v: TrialVars) => {
    const name = escapeHtml(v.firstName);

    const content = `
      <tr>
        <td style="padding-bottom:24px;">
          <h1 style="margin:0;font-size:26px;font-weight:800;color:#1a1a1a;line-height:1.3;letter-spacing:-0.4px;">
            Your second entry changes everything.
          </h1>
        </td>
      </tr>
      ${para(`Hey ${name},`)}
      ${para(`You recorded your first debrief. That\u2019s the hardest one to do, and you did it.`)}
      ${para(`Here\u2019s the part that\u2019s easy to miss: the first entry is just a snapshot. The second is where patterns start to show. By the fourth or fifth, your weekly report has enough to reflect something back you might not have noticed on your own.`)}
      ${para(`The next one only takes a few spoken minutes. Whenever you have them.`)}
      <tr>
        <td style="padding-bottom:28px;">
          ${trialButton(APP_STORE_URL, "Record now")}
        </td>
      </tr>
      <tr>
        <td>
          <p style="margin:0;font-size:16px;color:#1a1a1a;font-weight:600;">\u2014 Keenan</p>
        </td>
      </tr>
    `;

    return trialLayout({
      content,
      unsubscribeUrl: v.unsubscribeUrl,
      preheader: "Your first entry was a snapshot. The second is where it starts.",
    });
  },
};
