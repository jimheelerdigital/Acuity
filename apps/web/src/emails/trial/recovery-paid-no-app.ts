/**
 * Recovery Email 3 — Paid But Never Opened App
 *
 * Trigger: User has active subscription but firstRecordingAt IS NULL.
 *          2 hours after signup.
 * Subject: "Your trial started — one step left"
 * From: Keenan at Acuity <hello@getacuity.io>
 */

import { escapeHtml } from "@/lib/escape-html";
import { keenanSignature, trialButton, trialLayout } from "./layout";
import type { TrialEmailTemplate, TrialVars } from "./types";

const APP_STORE_URL = "https://apps.apple.com/us/app/acuity-daily/id6762633410";
const WEB_APP_URL = "https://getacuity.io/auth/signin";

function para(text: string): string {
  return `<tr><td style="padding-bottom:20px;"><p style="margin:0;font-size:16px;color:#374151;line-height:1.7;">${text}</p></td></tr>`;
}

export const recoveryPaidNoApp: TrialEmailTemplate = {
  subject: () => "Your trial started \u2014 one step left",
  html: (v: TrialVars) => {
    const rawFirst = (v.firstName ?? "").trim();
    const greeting = rawFirst ? `Hey ${escapeHtml(rawFirst)},` : "Hi there,";

    const content = `
      <tr>
        <td style="padding-bottom:24px;">
          <h1 style="margin:0;font-size:26px;font-weight:800;color:#1a1a1a;line-height:1.3;letter-spacing:-0.4px;">
            Your trial started. One step left.
          </h1>
        </td>
      </tr>
      ${para(greeting)}
      ${para(`Your 7-day trial is live. There\u2019s just one step between you and it:`)}
      <tr>
        <td style="padding-bottom:20px;">
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
            <tr>
              <td style="padding:8px 0;font-size:16px;color:#374151;line-height:1.7;">
                <strong style="color:#C4451C;">1.</strong> Download the app
              </td>
            </tr>
            <tr>
              <td style="padding:8px 0;font-size:16px;color:#374151;line-height:1.7;">
                <strong style="color:#C4451C;">2.</strong> Open it and press record.
              </td>
            </tr>
            <tr>
              <td style="padding:8px 0;font-size:16px;color:#374151;line-height:1.7;">
                <strong style="color:#C4451C;">3.</strong> Say whatever\u2019s on your mind. A short debrief is plenty.
              </td>
            </tr>
          </table>
        </td>
      </tr>
      ${para(`That\u2019s it. Acuity does the rest \u2014 it pulls out your tasks, keeps track of what you care about, and picks up on how you\u2019re actually feeling.`)}
      ${para(`Your first weekly report comes together once you have a few entries in. Most people just start with how the day went and go from there.`)}
      ${para(`On iPhone, download the app. On Android, or if you would rather not install anything, you can use the web app right in your browser:`)}
      <tr>
        <td style="padding-bottom:4px;">
          ${trialButton(APP_STORE_URL, "Get the iPhone app")}
        </td>
      </tr>
      <tr>
        <td style="padding-bottom:28px;">
          ${trialButton(WEB_APP_URL, "Open the web app")}
        </td>
      </tr>
      ${keenanSignature()}
    `;

    return trialLayout({
      content,
      unsubscribeUrl: v.unsubscribeUrl,
      preheader: "Your trial is live. Download the app and record your first entry.",
    });
  },
};
