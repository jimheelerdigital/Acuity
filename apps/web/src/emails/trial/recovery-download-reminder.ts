/**
 * Recovery email: Download Reminder
 *
 * Sent 1 hour after account creation if the user hasn't opened
 * the app or recorded their first debrief.
 */

import { escapeHtml } from "@/lib/escape-html";
import { trialButton, trialLayout } from "./layout";
import type { TrialEmailTemplate, TrialVars } from "./types";

const APP_STORE_URL =
  "https://apps.apple.com/us/app/acuity-daily/id6762633410";

function para(text: string): string {
  return `<tr><td style="padding-bottom:20px;"><p style="margin:0;font-size:16px;color:#374151;line-height:1.7;">${text}</p></td></tr>`;
}

export const recoveryDownloadReminder: TrialEmailTemplate = {
  subject: () => "Your Acuity app is waiting for you",
  html: (v: TrialVars) => {
    const content = `
      <tr><td style="padding-bottom:20px;">
        <p style="margin:0;font-size:16px;color:#374151;line-height:1.7;">
          Hi friend,
        </p>
      </td></tr>
      ${para(
        "It looks like you signed up but still haven\u2019t downloaded the app or recorded your first debrief..."
      )}
      ${para(
        "Here\u2019s the link to download the app in the App Store:"
      )}
      <tr><td style="padding-bottom:16px;">
        ${trialButton(APP_STORE_URL, "Download on the App Store")}
      </td></tr>
      ${para(
        "If you don\u2019t have iPhone, our Android app is coming soon. You can use our web app here:"
      )}
      <tr><td style="padding-bottom:20px;">
        ${trialButton("https://getacuity.io/home", "Use the web app")}
      </td></tr>
      ${para(
        "Feel free to reach out with any questions! Make sure you use your 7 day trial \u2014 there\u2019s a ton of insights that you can get with Acuity, even in the first week :)"
      )}
      <tr><td style="padding-top:8px;">
        <p style="margin:0;font-size:16px;color:#1a1a1a;">Kindly,</p>
        <p style="margin:0;font-size:16px;color:#1a1a1a;font-weight:600;">Keenan - Founder, Acuity</p>
      </td></tr>
    `;
    return trialLayout({
      content,
      unsubscribeUrl: v.unsubscribeUrl,
      preheader:
        "You signed up but haven\u2019t downloaded the app yet. Here\u2019s your link.",
    });
  },
};
