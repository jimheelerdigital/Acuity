/**
 * Download Rescue #4 — Webview Blocked
 *
 * Trigger: funnel_inapp_browser_detected fired (stuck in Instagram/Facebook
 *          in-app browser), appFirstOpenedAt null.
 * Subject: "Whoops — here it is"
 *
 * Highest priority rescue email — if a user is webview-blocked, they
 * get this one regardless of other download events.
 */

import { escapeHtml } from "@/lib/escape-html";
import { keenanSignature, primaryButton, trialLayout , para } from "./layout";
import type { TrialEmailTemplate, TrialVars } from "./types";

const APP_STORE_URL =
  "https://apps.apple.com/us/app/acuity-daily/id6762633410";


export const rescueWebviewBlocked: TrialEmailTemplate = {
  subject: () => "Whoops \u2014 here it is",
  html: (v: TrialVars) => {
    const rawFirst = (v.firstName ?? "").trim();
    const greeting = rawFirst && rawFirst !== "friend"
      ? `Hi ${escapeHtml(rawFirst)},`
      : "Hi there,";

    const content = `
      <tr>
        <td style="padding-bottom:24px;">
          <h1 style="margin:0;font-size:26px;font-weight:800;color:#1a1a1a;line-height:1.3;letter-spacing:-0.4px;">
            Whoops \u2014 here it is
          </h1>
        </td>
      </tr>
      ${para(greeting)}
      ${para(`Quick one. When you tried to get the app earlier, you were inside Instagram\u2019s (or Facebook\u2019s) built-in browser \u2014 and those block the App Store from opening. So it wasn\u2019t you, and it wasn\u2019t the app. It was the browser.`)}
      ${para(`Good news: you\u2019re out of that now. Just tap below and it\u2019ll take you straight there:`)}
      <tr>
        <td style="padding-bottom:20px;">
          ${primaryButton(APP_STORE_URL, "Open in the App Store")}
        </td>
      </tr>
      ${para(`That\u2019s it \u2014 no wall this time.`)}
      ${para(`Sorry for the runaround. You were trying to do the right thing the whole way through.`)}
      ${keenanSignature()}
    `;

    return trialLayout({
      content,
      unsubscribeUrl: v.unsubscribeUrl,
      preheader: "That last link hit a wall. This one won\u2019t.",
    });
  },
};
