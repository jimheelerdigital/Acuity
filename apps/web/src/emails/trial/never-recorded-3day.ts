/**
 * Never-Recorded Sequence — Email 3 (3 days left)
 *
 * Trigger: TRIAL user, trialEndsAt ~3 days out, totalRecordings = 0.
 *          ONLY sent to users with NO card on file / not paid.
 * Subject: "three days left..."
 */

import { escapeHtml } from "@/lib/escape-html";
import { keenanSignature, appStoreAndPlayButtons, secondaryButton, trialLayout , para } from "./layout";
import type { TrialEmailTemplate, TrialVars } from "./types";

const APP_STORE_URL =
  "https://apps.apple.com/us/app/acuity-daily/id6762633410";


export const neverRecorded3day: TrialEmailTemplate = {
  subject: () => "three days left...",
  html: (v: TrialVars) => {
    const rawFirst = (v.firstName ?? "").trim();
    const greeting = rawFirst && rawFirst !== "friend"
      ? `Hi ${escapeHtml(rawFirst)},`
      : "Hi there,";

    const content = `
      <tr>
        <td style="padding-bottom:24px;">
          <h1 style="margin:0;font-size:26px;font-weight:800;color:#1a1a1a;line-height:1.3;letter-spacing:-0.4px;">
            three days left...
          </h1>
        </td>
      </tr>
      ${para(greeting)}
      ${para(`Your free trial has three days left, and you still haven\u2019t recorded a single debrief. I\u2019d hate for the whole thing to come and go without you ever seeing what it does.`)}
      ${para(`You don\u2019t have to commit to anything. Just try it once. Open the app, talk for a few minutes, and let Acuity show you what it pulls out \u2014 the tasks, the patterns, the picture of your week. If it\u2019s not for you after that, no harm done.`)}
      ${para(`But don\u2019t let it end on nothing. Give it the one shot it needs.`)}
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
      preheader: "Your trial\u2019s almost up \u2014 don\u2019t let it end on nothing.",
    });
  },
};
