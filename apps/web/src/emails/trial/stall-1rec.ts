/**
 * Stall Re-engagement — Email A (1 recording, 48h silent)
 *
 * Trigger: User has exactly 1 completed recording AND 48h+ since
 *          their last (only) recording. Replaces the old
 *          "recorded once went quiet" email.
 * Subject: "don't leave it at one..."
 *
 * Links to the installed app (web app URL), NOT the App Store —
 * these users already have the app.
 */

import { escapeHtml } from "@/lib/escape-html";
import { keenanSignature, primaryButton, secondaryButton, trialLayout , para } from "./layout";
import type { TrialEmailTemplate, TrialVars } from "./types";


export const stall1rec: TrialEmailTemplate = {
  subject: () => "don\u2019t leave it at one...",
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
            don\u2019t leave it at one...
          </h1>
        </td>
      </tr>
      ${para(greeting)}
      ${para(`You recorded one debrief a couple days ago \u2014 and then it went quiet.`)}
      ${para(`Here\u2019s the thing about that first one: on its own, it\u2019s just a moment. The magic doesn\u2019t happen until there\u2019s a second, a third, a few more \u2014 because that\u2019s when Acuity starts connecting the dots. The patterns, the things you keep coming back to, the quiet stuff running your week \u2014 none of that shows up from a single debrief. It needs a little more to work with.`)}
      ${para(`You already did the hard part once. The next one\u2019s easier \u2014 you know how it feels now. Just a few minutes, whenever it suits you.`)}
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
      preheader: "You started \u2014 the magic needs a little more to work with.",
    });
  },
};
