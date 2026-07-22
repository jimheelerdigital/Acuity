/**
 * Recovery Email 4 — Recorded Once, Never Returned
 *
 * Trigger: User has 1 recording but none in the last 48 hours.
 *          48 hours after first recording.
 * Subject: "Your second entry changes everything"
 * From: Keenan from Ripple <keenan@getacuity.io> (set centrally in sendTrialEmail)
 */

import { escapeHtml } from "@/lib/escape-html";
import { keenanSignature, secondaryButton, trialButton, trialLayout, para } from "./layout";
import type { TrialEmailTemplate, TrialVars } from "./types";

// App Store listing — shows "OPEN" if installed, "GET" if not.
// (This email is currently disabled, replaced by stall_1rec.)
const APP_STORE_URL = "https://apps.apple.com/us/app/acuity-daily/id6762633410";


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
        <td style="padding-bottom:8px;">
          ${trialButton(APP_STORE_URL, "Record now")}
        </td>
      </tr>
      <tr>
        <td style="padding-bottom:28px;">
          ${secondaryButton("https://goripple.io/home", "Use the web version")}
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
