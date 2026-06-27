/**
 * Never-Recorded Sequence — Email 4 (last day)
 *
 * Trigger: TRIAL user, trialEndsAt within ~24h, totalRecordings = 0.
 *          ONLY sent to users with NO card on file / not paid.
 * Subject: "last call :/"
 */

import { escapeHtml } from "@/lib/escape-html";
import { keenanSignature, primaryButton, secondaryButton, trialLayout } from "./layout";
import type { TrialEmailTemplate, TrialVars } from "./types";

const APP_STORE_URL =
  "https://apps.apple.com/us/app/acuity-daily/id6762633410";

function para(text: string): string {
  return `<tr><td style="padding-bottom:20px;"><p style="margin:0;font-size:16px;color:#374151;line-height:1.7;">${text}</p></td></tr>`;
}

export const neverRecordedLastday: TrialEmailTemplate = {
  subject: () => "last call :/",
  html: (v: TrialVars) => {
    const rawFirst = (v.firstName ?? "").trim();
    const greeting = rawFirst && rawFirst !== "friend"
      ? `Hi ${escapeHtml(rawFirst)},`
      : "Hi there,";

    const content = `
      <tr>
        <td style="padding-bottom:24px;">
          <h1 style="margin:0;font-size:26px;font-weight:800;color:#1a1a1a;line-height:1.3;letter-spacing:-0.4px;">
            last call :/
          </h1>
        </td>
      </tr>
      ${para(greeting)}
      ${para(`Today\u2019s the last day of your trial \u2014 and this is the last little nudge I\u2019ll send.`)}
      ${para(`You signed up for a reason. Something about this made sense to you. Before it ends, give yourself the few minutes it takes to actually feel why: open the app, talk once, and see what comes back.`)}
      ${para(`If it lands, you\u2019ll know. If it doesn\u2019t, you\u2019ll know that too. But either way, you\u2019ll have actually tried the thing \u2014 instead of wondering.`)}
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
      preheader: "One debrief before your trial ends.",
    });
  },
};
