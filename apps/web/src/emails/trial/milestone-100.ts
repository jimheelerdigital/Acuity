/**
 * Milestone Email — 100 Recordings
 *
 * Referral nudge + product feedback ask.
 * Reply-to: keenan@getacuity.io.
 */

import { escapeHtml } from "@/lib/escape-html";
import { keenanSignature, trialLayout , para } from "./layout";
import type { TrialEmailTemplate, TrialVars } from "./types";


export const milestone100: TrialEmailTemplate = {
  subject: () => "you\u2019re in the top 1%",
  html: (v: TrialVars) => {
    const rawFirst = (v.firstName ?? "").trim();
    const greeting = rawFirst && rawFirst !== "friend"
      ? `Hi ${escapeHtml(rawFirst)},`
      : "Hi there,";

    const content = `
      <tr>
        <td style="padding-bottom:24px;">
          <h1 style="margin:0;font-size:26px;font-weight:800;color:#1a1a1a;line-height:1.3;letter-spacing:-0.4px;">
            you\u2019re in the top 1%
          </h1>
        </td>
      </tr>
      ${para(greeting)}
      ${para(`A hundred debriefs. I want you to know how rare that is \u2014 you\u2019re genuinely in the top 1% of people who use Ripple. That\u2019s the whole reason this exists.`)}
      ${para(`So two things. First: thank you. People like you are why we keep building.`)}
      ${para(`Second, a small ask. If Ripple\u2019s been this valuable to you, odds are there\u2019s someone in your life who\u2019d get something out of it too \u2014 a friend who\u2019s overwhelmed, someone who\u2019s always saying they wish they could keep track of their own head. If you passed it along, it\u2019d genuinely help us grow, and it might help them.`)}
      ${para(`I\u2019d love to hear what keeps you coming back \u2014 what\u2019s the main reason you use Ripple? Your feedback weighs more than most, so let me ask you directly: how can we make Ripple even better? Just hit reply.`)}
      ${para(`Thank you for being one of the rare ones.`)}
      ${keenanSignature()}
    `;

    return trialLayout({
      content,
      unsubscribeUrl: v.unsubscribeUrl,
      preheader: "100 debriefs. Let\u2019s talk.",
    });
  },
};
