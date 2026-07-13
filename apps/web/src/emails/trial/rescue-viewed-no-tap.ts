/**
 * Download Rescue #2 — Viewed Download, No Tap
 *
 * Trigger: Has funnel_download_screen_viewed but no funnel_app_store_clicked,
 *          appFirstOpenedAt null. NOT webview-blocked.
 * Subject: "Did something get in the way?"
 *
 * This email explicitly invites replies — sendTrialEmail is called with
 * replyTo: "keenan@getacuity.io" so replies go to a real monitored inbox.
 */

import { escapeHtml } from "@/lib/escape-html";
import { keenanSignature, appStoreAndPlayButtons, secondaryButton, trialLayout , para } from "./layout";
import type { TrialEmailTemplate, TrialVars } from "./types";


export const rescueViewedNoTap: TrialEmailTemplate = {
  subject: () => "Did something get in the way?",
  html: (v: TrialVars) => {
    const rawFirst = (v.firstName ?? "").trim();
    const greeting = rawFirst && rawFirst !== "friend"
      ? `Hi ${escapeHtml(rawFirst)},`
      : "Hi there,";

    const content = `
      <tr>
        <td style="padding-bottom:24px;">
          <h1 style="margin:0;font-size:26px;font-weight:800;color:#1a1a1a;line-height:1.3;letter-spacing:-0.4px;">
            Did something get in the way?
          </h1>
        </td>
      </tr>
      ${para(greeting)}
      ${para(`I noticed you made it all the way to the download step and then stopped \u2014 so I wanted to check in personally.`)}
      ${para(`No pressure at all. But if something got in the way \u2014 the download didn\u2019t work, you weren\u2019t sure it was worth it, or you just got pulled away \u2014 I\u2019d genuinely like to know. I read and reply to every one of these myself, so if you hit a snag or you\u2019re having second thoughts, just hit reply and tell me.`)}
      ${para(`And if you\u2019re ready, here are both ways in:`)}
      <tr>
        <td style="padding-bottom:8px;">
          ${appStoreAndPlayButtons()}
        </td>
      </tr>
      <tr>
        <td style="padding-bottom:20px;">
          ${secondaryButton(`${v.appUrl}/home`, "Use the web version")}
        </td>
      </tr>
      ${para(`Either way, thanks for giving it a look.`)}
      ${keenanSignature()}
    `;

    return trialLayout({
      content,
      unsubscribeUrl: v.unsubscribeUrl,
      preheader: "You got right to the last step \u2014 just checking in.",
    });
  },
};
