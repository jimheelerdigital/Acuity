/**
 * Winback Ladder — Email 4 (90 days silent — FINAL)
 *
 * Trigger: totalRecordings >= 1, lastRecordingAt 90+ days ago,
 *          NOT currently paying. HARD STOP — no emails after this.
 * Subject: "done after this one"
 * Invites replies — replyTo keenan@getacuity.io.
 *
 * No CTA buttons — this is a farewell + feedback ask only.
 */

import { escapeHtml } from "@/lib/escape-html";
import { keenanSignature, trialLayout } from "./layout";
import type { TrialEmailTemplate, TrialVars } from "./types";

function para(text: string): string {
  return `<tr><td style="padding-bottom:20px;"><p style="margin:0;font-size:16px;color:#374151;line-height:1.7;">${text}</p></td></tr>`;
}

export const winback90d: TrialEmailTemplate = {
  subject: () => "done after this one",
  html: (v: TrialVars) => {
    const rawFirst = (v.firstName ?? "").trim();
    const greeting = rawFirst && rawFirst !== "friend"
      ? `Hi ${escapeHtml(rawFirst)},`
      : "Hi there,";

    const content = `
      <tr>
        <td style="padding-bottom:24px;">
          <h1 style="margin:0;font-size:26px;font-weight:800;color:#1a1a1a;line-height:1.3;letter-spacing:-0.4px;">
            done after this one
          </h1>
        </td>
      </tr>
      ${para(greeting)}
      ${para(`It\u2019s been a few months, so this is the last one of these I\u2019ll send \u2014 I won\u2019t keep cluttering your inbox.`)}
      ${para(`Before you go, though, I\u2019d ask one favor. You tried Acuity and decided not to stick with it, and honestly, knowing why would help me more than almost anything. So if you\u2019ve got thirty seconds, just hit reply and tell me:`)}
      ${para(`\u2014 What was missing for you?<br/>
\u2014 What could we have done better?<br/>
\u2014 What made you decide not to continue?`)}
      ${para(`There\u2019s no wrong answer, and I read every single reply myself. Even one line helps.`)}
      ${para(`Your account and your debriefs are still here if you ever want them. But either way \u2014 thank you for giving it a try.`)}
      ${keenanSignature()}
    `;

    return trialLayout({
      content,
      unsubscribeUrl: v.unsubscribeUrl,
      preheader: "One last note \u2014 and one favor to ask.",
    });
  },
};
