/**
 * Stall Re-engagement — Email C (3+ recordings, 72h silent)
 *
 * Trigger: User has 3+ completed recordings AND 72h+ since their
 *          last recording. Longer silence window because established
 *          users have normal gaps.
 * Subject: "everything okay?"
 *
 * Invites replies — sendTrialEmail called with
 * replyTo: "keenan@getacuity.io" (real monitored inbox).
 * Links to the installed app (web app URL), NOT the App Store.
 */

import { escapeHtml } from "@/lib/escape-html";
import { keenanSignature, primaryButton, secondaryButton, trialLayout , para } from "./layout";
import type { TrialEmailTemplate, TrialVars } from "./types";


export const stall3plus: TrialEmailTemplate = {
  subject: () => "everything okay?",
  html: (v: TrialVars) => {
    const rawFirst = (v.firstName ?? "").trim();
    const greeting = rawFirst && rawFirst !== "friend"
      ? `Hi ${escapeHtml(rawFirst)},`
      : "Hi there,";

    const appLink = `${v.appUrl}/open`;

    const content = `
      <tr>
        <td style="padding-bottom:24px;">
          <h1 style="margin:0;font-size:26px;font-weight:800;color:#1a1a1a;line-height:1.3;letter-spacing:-0.4px;">
            everything okay?
          </h1>
        </td>
      </tr>
      ${para(greeting)}
      ${para(`You\u2019ve been recording debriefs for a bit now \u2014 enough that Acuity\u2019s actually started to know your patterns. But it\u2019s been a few days since your last one, so I wanted to check in.`)}
      ${para(`No pressure at all. Life gets busy, and a gap here and there is normal. But you\u2019ve built something real \u2014 a real picture of your weeks, your tasks, the things that keep coming up. The longer the gap, the more that picture goes stale, and I\u2019d hate for the work you\u2019ve already put in to fade out.`)}
      ${para(`If something changed, or it stopped being useful, I\u2019d genuinely like to know \u2014 just hit reply. And if you\u2019ve just been busy, picking it back up takes a couple of minutes.`)}
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
      preheader: "You\u2019ve been at this a while \u2014 just checking in.",
    });
  },
};
