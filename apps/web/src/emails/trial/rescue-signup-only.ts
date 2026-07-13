/**
 * Download Rescue #1 — Signed Up Only
 *
 * Trigger: Account created, never reached the download screen
 *          (no funnel_download_screen_viewed event), appFirstOpenedAt null.
 * Subject: "You did the hard part. The easy part's waiting."
 */

import { escapeHtml } from "@/lib/escape-html";
import { keenanSignature, appStoreAndPlayButtons, secondaryButton, trialLayout , para } from "./layout";
import type { TrialEmailTemplate, TrialVars } from "./types";

const APP_STORE_URL =
  "https://apps.apple.com/us/app/acuity-daily/id6762633410";


export const rescueSignupOnly: TrialEmailTemplate = {
  subject: () => "You did the hard part. The easy part\u2019s waiting.",
  html: (v: TrialVars) => {
    const rawFirst = (v.firstName ?? "").trim();
    const greeting = rawFirst && rawFirst !== "friend"
      ? `Hi ${escapeHtml(rawFirst)},`
      : "Hi there,";

    const content = `
      <tr>
        <td style="padding-bottom:24px;">
          <h1 style="margin:0;font-size:26px;font-weight:800;color:#1a1a1a;line-height:1.3;letter-spacing:-0.4px;">
            You did the hard part. The easy part\u2019s waiting.
          </h1>
        </td>
      </tr>
      ${para(greeting)}
      ${para(`So you signed up \u2014 and then life probably did what life does and pulled you somewhere else. Totally get it.`)}
      ${para(`But here\u2019s the thing: you\u2019ve already done the hard part. The app \u2014 the part that actually does the work \u2014 takes about thirty seconds to grab, and you haven\u2019t yet.`)}
      ${para(`And it\u2019s a shame, because this is where it gets good. You talk for a few minutes about your day, and Acuity quietly catches what you\u2019d otherwise lose \u2014 the task buried in a sentence, the worry you keep circling back to, the honest picture of where your week actually went. No typing. No blank page staring back at you. You just talk, and it listens.`)}
      ${para(`Right now you\u2019ve got the door open and one foot through it. This is the other foot.`)}
      <tr>
        <td style="padding-bottom:8px;">
          ${appStoreAndPlayButtons(APP_STORE_URL)}
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
      preheader: "You\u2019re signed up \u2014 the app is where it all actually happens.",
    });
  },
};
