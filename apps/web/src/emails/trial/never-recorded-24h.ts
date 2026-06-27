/**
 * Never-Recorded Sequence — Email 1 (24h)
 *
 * Trigger: TRIAL user, ~24h after signup, totalRecordings = 0.
 *          Sent to ALL trial users (card on file or not).
 * Subject: "you dropped this..."
 */

import { escapeHtml } from "@/lib/escape-html";
import { keenanSignature, primaryButton, secondaryButton, trialLayout } from "./layout";
import type { TrialEmailTemplate, TrialVars } from "./types";

const APP_STORE_URL =
  "https://apps.apple.com/us/app/acuity-daily/id6762633410";

function para(text: string): string {
  return `<tr><td style="padding-bottom:20px;"><p style="margin:0;font-size:16px;color:#374151;line-height:1.7;">${text}</p></td></tr>`;
}

export const neverRecorded24h: TrialEmailTemplate = {
  subject: () => "you dropped this...",
  html: (v: TrialVars) => {
    const rawFirst = (v.firstName ?? "").trim();
    const greeting = rawFirst && rawFirst !== "friend"
      ? `Hi ${escapeHtml(rawFirst)},`
      : "Hi there,";

    const content = `
      <tr>
        <td style="padding-bottom:24px;">
          <h1 style="margin:0;font-size:26px;font-weight:800;color:#1a1a1a;line-height:1.3;letter-spacing:-0.4px;">
            you dropped this...
          </h1>
        </td>
      </tr>
      ${para(greeting)}
      ${para(`You did the hard part (signing up), but looks like you dropped the whole point of Acuity... using it!`)}
      ${para(`Here\u2019s all it is: open the app, tap record, and talk for a few minutes about whatever\u2019s on your mind \u2014 your day, what\u2019s weighing on you, what you need to get done. We handle the rest \u2014 life insights, pattern tracking, and a little more peace of mind.`)}
      ${para(`The first one\u2019s the only one that ever feels unfamiliar. After that, it\u2019s just talking.`)}
      <tr>
        <td style="padding-bottom:8px;">
          ${primaryButton(APP_STORE_URL, "Get the app")}
        </td>
      </tr>
      <tr>
        <td style="padding-bottom:28px;">
          ${secondaryButton(`${v.appUrl}/home`, "Use the web version")}
        </td>
      </tr>
      ${keenanSignature()}
    `;

    return trialLayout({
      content,
      unsubscribeUrl: v.unsubscribeUrl,
      preheader: "You\u2019re in \u2014 but you left the best part behind.",
    });
  },
};
