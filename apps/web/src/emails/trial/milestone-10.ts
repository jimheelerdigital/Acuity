/**
 * Milestone Email — 10 Recordings
 *
 * Feedback ask + App Store review request.
 * Reply-to: keenan@getacuity.io (real monitored inbox).
 */

import { escapeHtml } from "@/lib/escape-html";
import { keenanSignature, primaryButton, trialLayout , para } from "./layout";
import type { TrialEmailTemplate, TrialVars } from "./types";

const REVIEW_URL =
  "https://apps.apple.com/app/id6762633410?action=write-review";


export const milestone10: TrialEmailTemplate = {
  subject: () => "10 in \u2014 how\u2019s it feeling?",
  html: (v: TrialVars) => {
    const rawFirst = (v.firstName ?? "").trim();
    const greeting = rawFirst && rawFirst !== "friend"
      ? `Hi ${escapeHtml(rawFirst)},`
      : "Hi there,";

    const content = `
      <tr>
        <td style="padding-bottom:24px;">
          <h1 style="margin:0;font-size:26px;font-weight:800;color:#1a1a1a;line-height:1.3;letter-spacing:-0.4px;">
            10 in \u2014 how\u2019s it feeling?
          </h1>
        </td>
      </tr>
      ${para(greeting)}
      ${para(`Ten debriefs in. That\u2019s not nothing \u2014 that\u2019s a habit taking hold, and most people never get this far.`)}
      ${para(`I\u2019m curious how it\u2019s landing for you. Is Ripple catching the things that matter? Are the patterns starting to feel useful? Anything that\u2019s clicked, or anything that\u2019s bugged you?`)}
      ${para(`I read every reply myself, and this early feedback genuinely shapes what we build next. If you\u2019ve got a minute, just hit reply and tell me how it\u2019s going.`)}
      ${para(`And if you\u2019re already loving it \u2014 one small thing. We\u2019re a small company trying to grow and help more people do what you\u2019re doing, and honestly, each App Store review means the world to us. If Ripple\u2019s been good to you, we\u2019d be grateful if you left one.`)}
      <tr>
        <td style="padding-bottom:20px;">
          ${primaryButton(REVIEW_URL, "Leave a review")}
        </td>
      </tr>
      ${para(`Either way \u2014 keep going. It only gets sharper from here.`)}
      ${keenanSignature()}
    `;

    return trialLayout({
      content,
      unsubscribeUrl: v.unsubscribeUrl,
      preheader: "You\u2019ve got a real habit going. Quick question.",
    });
  },
};
