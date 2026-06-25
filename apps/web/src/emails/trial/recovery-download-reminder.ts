/**
 * Recovery email: Download Reminder
 *
 * Sent 1 hour after account creation if the user hasn't opened
 * the app or recorded their first debrief.
 */

import { escapeHtml } from "@/lib/escape-html";
import { keenanSignature, trialButton, trialLayout } from "./layout";
import type { TrialEmailTemplate, TrialVars } from "./types";

const APP_STORE_URL =
  "https://apps.apple.com/us/app/acuity-daily/id6762633410";

function para(text: string): string {
  return `<tr><td style="padding-bottom:20px;"><p style="margin:0;font-size:16px;color:#374151;line-height:1.7;">${text}</p></td></tr>`;
}

export const recoveryDownloadReminder: TrialEmailTemplate = {
  subject: () => "Your Acuity app is waiting for you",
  html: (v: TrialVars) => {
    const rawFirst = (v.firstName ?? "").trim();
    const greeting = rawFirst ? `Hi ${escapeHtml(rawFirst)},` : "Hi there,";
    const content = `
      <tr><td style="padding-bottom:20px;">
        <p style="margin:0;font-size:16px;color:#374151;line-height:1.7;">
          ${greeting}
        </p>
      </td></tr>
      ${para(
        "It looks like you signed up but haven\u2019t downloaded the app or recorded your first debrief yet."
      )}
      ${para(
        "Here\u2019s the link to download the app in the App Store:"
      )}
      <tr><td style="padding-bottom:16px;">
        ${trialButton(APP_STORE_URL, "Download on the App Store")}
      </td></tr>
      ${para(
        "On Android? It\u2019s coming soon \u2014 for now, the web app has everything:"
      )}
      <tr><td style="padding-bottom:20px;">
        ${trialButton("https://getacuity.io/auth/signin", "Use the web app")}
      </td></tr>
      ${para(
        "Whenever you\u2019re ready, your trial is there waiting. A few spoken minutes is all it takes to start \u2014 and if anything\u2019s in your way, just reply and let me know."
      )}
      <tr><td style="padding-top:8px;padding-bottom:12px;">
        <p style="margin:0;font-size:16px;color:#1a1a1a;">Kindly,</p>
      </td></tr>
      ${keenanSignature()}
    `;
    return trialLayout({
      content,
      unsubscribeUrl: v.unsubscribeUrl,
      preheader:
        "You signed up but haven\u2019t downloaded the app yet. Here\u2019s your link.",
    });
  },
};
