/**
 * Stall Re-engagement — Email B (2 recordings, 48h silent)
 *
 * Trigger: User has exactly 2 completed recordings AND 48h+ since
 *          their last recording.
 * Subject: "right before the good part?"
 *
 * Links to the installed app (web app URL), NOT the App Store.
 */

import { escapeHtml } from "@/lib/escape-html";
import { keenanSignature, primaryButton, secondaryButton, trialLayout } from "./layout";
import type { TrialEmailTemplate, TrialVars } from "./types";

function para(text: string): string {
  return `<tr><td style="padding-bottom:20px;"><p style="margin:0;font-size:16px;color:#374151;line-height:1.7;">${text}</p></td></tr>`;
}

export const stall2rec: TrialEmailTemplate = {
  subject: () => "right before the good part?",
  html: (v: TrialVars) => {
    const rawFirst = (v.firstName ?? "").trim();
    const greeting = rawFirst && rawFirst !== "friend"
      ? `Hi ${escapeHtml(rawFirst)},`
      : "Hi there,";

    const appLink = `${v.appUrl}/home`;

    const content = `
      <tr>
        <td style="padding-bottom:24px;">
          <h1 style="margin:0;font-size:26px;font-weight:800;color:#1a1a1a;line-height:1.3;letter-spacing:-0.4px;">
            right before the good part?
          </h1>
        </td>
      </tr>
      ${para(greeting)}
      ${para(`You recorded two debriefs and then went quiet on me \u2014 and I wanted to nudge you before the thread goes cold.`)}
      ${para(`You\u2019re actually right at the point where this starts to pay off. Two debriefs is enough for Acuity to begin noticing things; a few more and it starts handing real stuff back to you \u2014 patterns you didn\u2019t see, tasks you\u2019d have lost, a clearer read on where your week actually went.`)}
      ${para(`You\u2019ve got momentum. It\u2019s a shame to let it stall right before the good part. A few minutes is all it takes to pick it back up.`)}
      <tr>
        <td style="padding-bottom:8px;">
          ${primaryButton(appLink, "Open Acuity")}
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
      preheader: "Two debriefs in, then quiet \u2014 let\u2019s keep it going.",
    });
  },
};
