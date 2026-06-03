/**
 * Recovery email: Download Reminder
 *
 * Sent 1 hour after account creation if the user never clicked
 * "Download on the App Store" or opened the app. Feels like a
 * personal note from Keenan, not a marketing blast.
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
  subject: () => "Start your Acuity trial \u2014 no card required",
  html: (v: TrialVars) => {
    const name = escapeHtml(v.firstName);
    const content = `
      <tr><td style="padding-bottom:20px;">
        <p style="margin:0;font-size:16px;color:#374151;line-height:1.7;">
          Hey ${name},
        </p>
      </td></tr>
      ${para(
        "We noticed you created your account but haven\u2019t downloaded the app yet. Here\u2019s your links for easy access \u2014 no card required."
      )}
      ${para("Your trial is active and ready to go.")}
      <tr><td style="padding-bottom:12px;">
        ${trialButton(APP_STORE_URL, "Download on the App Store")}
      </td></tr>
      <tr><td style="padding-bottom:24px;">
        ${trialButton("https://getacuity.io/auth/signin", "Sign in on the web")}
      </td></tr>
      <tr><td style="padding-bottom:28px;">
        <p style="margin:0;font-size:13px;color:#9ca3af;line-height:1.6;">
          Android app coming soon. Use the web app in the meantime.
        </p>
      </td></tr>
      <tr><td>
        <p style="margin:0;font-size:16px;color:#1a1a1a;font-weight:600;">&mdash; Keenan, Acuity founder</p>
      </td></tr>
    `;
    return trialLayout({
      content,
      unsubscribeUrl: v.unsubscribeUrl,
      preheader:
        "Your trial is active. Download the app to get started.",
    });
  },
};
