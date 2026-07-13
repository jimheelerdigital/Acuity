/**
 * Download Rescue #3 — Tapped App Store, Never Opened
 *
 * Trigger: Has funnel_app_store_clicked but appFirstOpenedAt still null,
 *          NOT webview-blocked (no funnel_inapp_browser_detected event).
 * Subject: "Looks like the download didn't finish"
 */

import { escapeHtml } from "@/lib/escape-html";
import { keenanSignature, appStoreAndPlayButtons, trialLayout , para } from "./layout";
import type { TrialEmailTemplate, TrialVars } from "./types";

const APP_STORE_URL =
  "https://apps.apple.com/us/app/acuity-daily/id6762633410";


export const rescueTappedAppStore: TrialEmailTemplate = {
  subject: () => "Looks like the download didn\u2019t finish",
  html: (v: TrialVars) => {
    const rawFirst = (v.firstName ?? "").trim();
    const greeting = rawFirst && rawFirst !== "friend"
      ? `Hi ${escapeHtml(rawFirst)},`
      : "Hi there,";

    const content = `
      <tr>
        <td style="padding-bottom:24px;">
          <h1 style="margin:0;font-size:26px;font-weight:800;color:#1a1a1a;line-height:1.3;letter-spacing:-0.4px;">
            Looks like the download didn\u2019t finish
          </h1>
        </td>
      </tr>
      ${para(greeting)}
      ${para(`Looks like you went to grab the app but it didn\u2019t quite finish installing \u2014 happens all the time, usually nothing on your end.`)}
      ${para(`Here\u2019s the direct link to pick up where you left off:`)}
      <tr>
        <td style="padding-bottom:20px;">
          ${appStoreAndPlayButtons(APP_STORE_URL)}
        </td>
      </tr>
      ${para(`One tip: if you\u2019re tapping this from inside Instagram or Facebook, those apps have a built-in browser that can block the App Store. If it won\u2019t open, open this email from your Mail app instead and tap the link there \u2014 it\u2019ll go straight through.`)}
      ${para(`You were basically there. This is the last step.`)}
      ${keenanSignature()}
    `;

    return trialLayout({
      content,
      unsubscribeUrl: v.unsubscribeUrl,
      preheader: "You were one tap away \u2014 here\u2019s the direct link.",
    });
  },
};
