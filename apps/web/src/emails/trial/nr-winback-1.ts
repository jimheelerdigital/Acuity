/**
 * Never-Recorded Re-engagement Drip — Email 1 (Day 1)
 *
 * One-time backlog drip for users who signed up but never recorded.
 * Subject: "you never gave it a shot"
 */

import { escapeHtml } from "@/lib/escape-html";
import { keenanSignature, appStoreAndPlayButtons, secondaryButton, trialLayout, para } from "./layout";
import type { TrialEmailTemplate, TrialVars } from "./types";

const APP_STORE_URL =
  "https://apps.apple.com/us/app/acuity-daily/id6762633410";

export const nrWinback1: TrialEmailTemplate = {
  subject: () => "you never gave it a shot",
  html: (v: TrialVars) => {
    const rawFirst = (v.firstName ?? "").trim();
    const greeting = rawFirst && rawFirst !== "friend"
      ? `Hi ${escapeHtml(rawFirst)},`
      : "Hi there,";

    const content = `
      <tr>
        <td style="padding-bottom:24px;">
          <h1 style="margin:0;font-size:26px;font-weight:800;color:#1a1a1a;line-height:1.3;letter-spacing:-0.4px;">
            you never gave it a shot
          </h1>
        </td>
      </tr>
      ${para(greeting)}
      ${para(`A while back you signed up for Acuity \u2014 and then never actually recorded anything. No judgment; life gets in the way and most good intentions quietly stall.`)}
      ${para(`But I didn\u2019t want you to miss what you signed up for. Acuity isn\u2019t something you read or set up \u2014 it\u2019s something you talk to. You open it, say what\u2019s on your mind for a few minutes, and it does the rest: pulls out your tasks, notices your patterns, and gives you a clearer read on your own life.`)}
      ${para(`That\u2019s it. One debrief and you\u2019ll get what it\u2019s actually about.`)}
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
      preheader: "You signed up for Acuity \u2014 but never actually tried it.",
    });
  },
};
