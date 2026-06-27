/**
 * Recovery Email 4 — Recorded Once, Never Returned
 *
 * Trigger: User has 1 recording but none in the last 48 hours.
 *          48 hours after first recording.
 * Subject: "Your second entry changes everything"
 * From: Keenan at Acuity <hello@getacuity.io>
 */

import { escapeHtml } from "@/lib/escape-html";
import { keenanSignature, trialButton, trialLayout } from "./layout";
import type { TrialEmailTemplate, TrialVars } from "./types";

// User has recorded — they have the app. Use /open universal link,
// not the App Store. (This email is currently disabled, replaced by
// stall_1rec, but correct the link for if it's ever re-enabled.)
const APP_OPEN_URL = "https://www.getacuity.io/open";

function para(text: string): string {
  return `<tr><td style="padding-bottom:20px;"><p style="margin:0;font-size:16px;color:#374151;line-height:1.7;">${text}</p></td></tr>`;
}

export const recoveryRecordedOnce: TrialEmailTemplate = {
  subject: () => "Your second entry changes everything",
  html: (v: TrialVars) => {
    const rawFirst = (v.firstName ?? "").trim();
    const greeting = rawFirst ? `Hey ${escapeHtml(rawFirst)},` : "Hi there,";

    const content = `
      <tr>
        <td style="padding-bottom:24px;">
          <h1 style="margin:0;font-size:26px;font-weight:800;color:#1a1a1a;line-height:1.3;letter-spacing:-0.4px;">
            Your second entry changes everything.
          </h1>
        </td>
      </tr>
      ${para(greeting)}
      ${para(`You recorded your first debrief. That\u2019s the hardest one to do, and you did it.`)}
      ${para(`Here\u2019s the part that\u2019s easy to miss: the first entry is just a snapshot. The second is where patterns start to show. By the fourth or fifth, your weekly report has enough to reflect something back you might not have noticed on your own.`)}
      ${para(`The next one only takes a few spoken minutes. Whenever you have them.`)}
      <tr>
        <td style="padding-bottom:28px;">
          ${trialButton(APP_OPEN_URL, "Record now")}
        </td>
      </tr>
      ${keenanSignature()}
    `;

    return trialLayout({
      content,
      unsubscribeUrl: v.unsubscribeUrl,
      preheader: "Your first entry was a snapshot. The second is where it starts.",
    });
  },
};
