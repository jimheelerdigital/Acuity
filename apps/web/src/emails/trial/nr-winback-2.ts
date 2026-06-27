/**
 * Never-Recorded Re-engagement Drip — Email 2 (Day 3)
 *
 * Sends ~2 days after email 1, only if still 0 recordings.
 * Subject: "here's what one debrief gets you"
 */

import { escapeHtml } from "@/lib/escape-html";
import { keenanSignature, primaryButton, secondaryButton, trialLayout, para } from "./layout";
import type { TrialEmailTemplate, TrialVars } from "./types";

export const nrWinback2: TrialEmailTemplate = {
  subject: () => "here\u2019s what one debrief gets you",
  html: (v: TrialVars) => {
    const rawFirst = (v.firstName ?? "").trim();
    const greeting = rawFirst && rawFirst !== "friend"
      ? `Hi ${escapeHtml(rawFirst)},`
      : "Hi there,";

    const content = `
      <tr>
        <td style="padding-bottom:24px;">
          <h1 style="margin:0;font-size:26px;font-weight:800;color:#1a1a1a;line-height:1.3;letter-spacing:-0.4px;">
            here\u2019s what one debrief gets you
          </h1>
        </td>
      </tr>
      ${para(greeting)}
      ${para(`Still haven\u2019t recorded your first debrief \u2014 so let me show you what\u2019s actually waiting, because it\u2019s more than you\u2019d think for a few spoken minutes.`)}
      ${para(`One debrief gets you:<br/>
\u2014 Your tasks, pulled out automatically. The stuff you mention and forget \u2014 Acuity catches it so you don\u2019t have to hold it in your head.<br/>
\u2014 Patterns you can\u2019t see yourself. The things you keep circling back to, quietly running your mood and your time.<br/>
\u2014 A clear read on where your energy actually goes \u2014 across work, health, relationships, money, all of it.`)}
      ${para(`None of that exists until you talk to it once. No writing, no blank page, no setup. Just talk.`)}
      <tr>
        <td style="padding-bottom:8px;">
          ${primaryButton(`${v.appUrl}/open`, "Open Acuity")}
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
      preheader: "You haven\u2019t tried it yet \u2014 here\u2019s what\u2019s on the other side.",
    });
  },
};
