/**
 * Milestone Email — 25 Recordings
 *
 * Feedback ask + App Store review request.
 * Reply-to: keenan@getacuity.io.
 */

import { escapeHtml } from "@/lib/escape-html";
import { keenanSignature, primaryButton, trialLayout , para } from "./layout";
import type { TrialEmailTemplate, TrialVars } from "./types";

const REVIEW_URL =
  "https://apps.apple.com/app/id6762633410?action=write-review";


export const milestone25: TrialEmailTemplate = {
  subject: () => "can I ask you something?",
  html: (v: TrialVars) => {
    const rawFirst = (v.firstName ?? "").trim();
    const greeting = rawFirst && rawFirst !== "friend"
      ? `Hi ${escapeHtml(rawFirst)},`
      : "Hi there,";

    const content = `
      <tr>
        <td style="padding-bottom:24px;">
          <h1 style="margin:0;font-size:26px;font-weight:800;color:#1a1a1a;line-height:1.3;letter-spacing:-0.4px;">
            can I ask you something?
          </h1>
        </td>
      </tr>
      ${para(greeting)}
      ${para(`Twenty-five debriefs. Acuity\u2019s clearly become part of your routine \u2014 and before I assume it\u2019s all working perfectly, I\u2019d rather just ask you.`)}
      ${para(`How\u2019s it actually going? Is it catching what matters? Is there something that annoys you, something missing, something you wish it did better? We\u2019re a small team and still shaping this, so your honest take genuinely changes what we build. Just hit reply \u2014 I read every one.`)}
      ${para(`And if you\u2019re loving it \u2014 would you mind leaving us a positive review in the App Store? It\u2019s the single biggest thing that helps other people find Acuity, and it takes about twenty seconds.`)}
      <tr>
        <td style="padding-bottom:20px;">
          ${primaryButton(REVIEW_URL, "Leave a review")}
        </td>
      </tr>
      ${para(`Either way, thank you for being here.`)}
      ${keenanSignature()}
    `;

    return trialLayout({
      content,
      unsubscribeUrl: v.unsubscribeUrl,
      preheader: "25 debriefs in \u2014 I want to know how it\u2019s really going.",
    });
  },
};
