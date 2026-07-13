/**
 * Never-Recorded Sequence — Email 2 (48h)
 *
 * Trigger: TRIAL user, ~48h after signup, totalRecordings = 0.
 *          Sent to ALL trial users (card on file or not).
 * Subject: "uh oh... did you forget?"
 */

import { escapeHtml } from "@/lib/escape-html";
import { keenanSignature, appStoreAndPlayButtons, secondaryButton, trialLayout , para } from "./layout";
import type { TrialEmailTemplate, TrialVars } from "./types";

const APP_STORE_URL =
  "https://apps.apple.com/us/app/acuity-daily/id6762633410";


export const neverRecorded48h: TrialEmailTemplate = {
  subject: () => "uh oh... did you forget?",
  html: (v: TrialVars) => {
    const rawFirst = (v.firstName ?? "").trim();
    const greeting = rawFirst && rawFirst !== "friend"
      ? `Hi ${escapeHtml(rawFirst)},`
      : "Hi there,";

    const content = `
      <tr>
        <td style="padding-bottom:24px;">
          <h1 style="margin:0;font-size:26px;font-weight:800;color:#1a1a1a;line-height:1.3;letter-spacing:-0.4px;">
            uh oh... did you forget?
          </h1>
        </td>
      </tr>
      ${para(greeting)}
      ${para(`Still haven\u2019t recorded your first debrief \u2014 so let me tell you what\u2019s actually waiting on the other side of it, because right now you\u2019re skipping the whole point.`)}
      ${para(`One debrief gets you:<br/>
\u2014 Your tasks, pulled out automatically. The stuff you mention and forget \u2014 Ripple catches it so you don\u2019t have to hold it in your head.<br/>
\u2014 Patterns you can\u2019t see yourself. The things you keep circling back to, week after week, quietly running your mood and your time.<br/>
\u2014 A clear read on where your energy actually goes \u2014 across work, health, relationships, money, all of it.`)}
      ${para(`None of that exists until you talk to it once. It\u2019s a few minutes. That\u2019s the whole ask.`)}
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
      preheader: "You haven\u2019t recorded yet \u2014 and it\u2019s the good part you\u2019re skipping.",
    });
  },
};
