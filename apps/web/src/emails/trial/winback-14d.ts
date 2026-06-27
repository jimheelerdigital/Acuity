/**
 * Winback Ladder — Email 2 (14 days silent)
 *
 * Trigger: totalRecordings >= 1, lastRecordingAt 14+ days ago,
 *          NOT currently paying.
 * Subject: "it adds up"
 */

import { escapeHtml } from "@/lib/escape-html";
import { keenanSignature, primaryButton, secondaryButton, trialLayout , para } from "./layout";
import type { TrialEmailTemplate, TrialVars } from "./types";


export const winback14d: TrialEmailTemplate = {
  subject: () => "it adds up",
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
            it adds up
          </h1>
        </td>
      </tr>
      ${para(greeting)}
      ${para(`A couple weeks since your last debrief now. No pitch here \u2014 just one thing worth knowing.`)}
      ${para(`Acuity compounds. Every debrief makes the next insight sharper, the patterns clearer, the picture of your life more complete. It\u2019s not about any single recording \u2014 it\u2019s about what builds up across them. A handful of debriefs is a moment. Dozens is a mirror.`)}
      ${para(`That\u2019s all. The door\u2019s open whenever you want to keep building it.`)}
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
      preheader: "The more you talk to it, the sharper it gets.",
    });
  },
};
