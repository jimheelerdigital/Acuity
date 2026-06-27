/**
 * Milestone Email — 365 Recordings
 *
 * Year recognition — no CTA buttons, pure acknowledgment.
 * Reply-to: keenan@getacuity.io.
 */

import { escapeHtml } from "@/lib/escape-html";
import { keenanSignature, trialLayout , para } from "./layout";
import type { TrialEmailTemplate, TrialVars } from "./types";


export const milestone365: TrialEmailTemplate = {
  subject: () => "look how far you\u2019ve come",
  html: (v: TrialVars) => {
    const rawFirst = (v.firstName ?? "").trim();
    const greeting = rawFirst && rawFirst !== "friend"
      ? `Hi ${escapeHtml(rawFirst)},`
      : "Hi there,";

    const content = `
      <tr>
        <td style="padding-bottom:24px;">
          <h1 style="margin:0;font-size:26px;font-weight:800;color:#1a1a1a;line-height:1.3;letter-spacing:-0.4px;">
            look how far you\u2019ve come
          </h1>
        </td>
      </tr>
      ${para(greeting)}
      ${para(`Three hundred and sixty-five debriefs.`)}
      ${para(`I don\u2019t have a clever subject line for this one, because it deserves a straight one: that\u2019s a year\u2019s worth of showing up for yourself. A year of paying attention. Most people never do that for themselves once, let alone three hundred and sixty-five times.`)}
      ${para(`Somewhere in all those debriefs is a real record of your life \u2014 what you worried about, what you worked through, what mattered, how you changed. That\u2019s not a small thing. That\u2019s the whole point of this.`)}
      ${para(`I just wanted to stop and acknowledge it. Thank you for trusting Acuity to hold all of that. And if you ever feel like telling me what this year of debriefs has meant to you, I will read every word.`)}
      ${para(`Here\u2019s to the next one.`)}
      ${keenanSignature()}
    `;

    return trialLayout({
      content,
      unsubscribeUrl: v.unsubscribeUrl,
      preheader: "365 debriefs. That\u2019s a year of showing up for yourself.",
    });
  },
};
