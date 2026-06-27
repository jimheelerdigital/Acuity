/**
 * Winback Ladder — Email 1 (7 days silent)
 *
 * Trigger: totalRecordings >= 1, lastRecordingAt 7+ days ago,
 *          NOT currently paying (subscriptionStatus != PRO).
 * Subject: "silent 7..."
 * Invites replies — replyTo keenan@getacuity.io.
 */

import { escapeHtml } from "@/lib/escape-html";
import { keenanSignature, primaryButton, secondaryButton, trialLayout , para } from "./layout";
import type { TrialEmailTemplate, TrialVars } from "./types";


export const winback7d: TrialEmailTemplate = {
  subject: () => "silent 7...",
  html: (v: TrialVars) => {
    const rawFirst = (v.firstName ?? "").trim();
    const greeting = rawFirst && rawFirst !== "friend"
      ? `Hi ${escapeHtml(rawFirst)},`
      : "Hi there,";

    const appLink = "https://apps.apple.com/us/app/acuity-daily/id6762633410";

    const content = `
      <tr>
        <td style="padding-bottom:24px;">
          <h1 style="margin:0;font-size:26px;font-weight:800;color:#1a1a1a;line-height:1.3;letter-spacing:-0.4px;">
            silent 7...
          </h1>
        </td>
      </tr>
      ${para(greeting)}
      ${para(`It\u2019s been about a week since your last debrief \u2014 and in that week, a lot went unspoken.`)}
      ${para(`Every day you don\u2019t debrief is a day of tasks that slip through, patterns that go unnoticed, and a week that blurs together instead of coming into focus. That\u2019s the stuff Acuity catches for you \u2014 but only when you talk to it.`)}
      ${para(`The debriefs you already recorded are still here. But the real value is in what you\u2019re not capturing right now.`)}
      ${para(`And if something\u2019s holding you back \u2014 it felt like a hassle, you weren\u2019t sure it was working, anything \u2014 just hit reply and tell me. I read every one.`)}
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
      preheader: "Here\u2019s what\u2019s quietly slipping by.",
    });
  },
};
