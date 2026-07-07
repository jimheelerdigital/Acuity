/**
 * Winback Ladder — Email 3 (30 days silent)
 *
 * Trigger: totalRecordings >= 1, lastRecordingAt 30+ days ago,
 *          NOT currently paying.
 * Subject: "given up?"
 * Invites replies — replyTo keenan@getacuity.io.
 */

import { escapeHtml } from "@/lib/escape-html";
import { keenanSignature, primaryButton, secondaryButton, trialLayout , para } from "./layout";
import type { TrialEmailTemplate, TrialVars } from "./types";


export const winback30d: TrialEmailTemplate = {
  subject: () => "given up?",
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
            given up?
          </h1>
        </td>
      </tr>
      ${para(greeting)}
      ${para(`It\u2019s been about a month, so I\u2019ll ask straight: have you given up on it?`)}
      ${para(`No judgment if you have. But here\u2019s what I keep coming back to \u2014 you signed up for a reason. Something in your life made you think <em>I want to get a handle on this.</em> That reason didn\u2019t go away just because the habit stalled.`)}
      ${para(`Ripple exists to help you get where you were trying to go \u2014 clearer on your patterns, on top of your tasks, less lost in the blur of your weeks. We want to help you actually get there.`)}
      ${para(`But if something got in the way \u2014 it didn\u2019t click, it felt like work, it was missing something you needed \u2014 I really want to know. What would\u2019ve made it worth keeping? Just hit reply. I read every one, and that kind of honesty is how this gets better.`)}
      ${para(`Your debriefs are still here. So is the reason you started.`)}
      <tr>
        <td style="padding-bottom:8px;">
          ${primaryButton(appLink, "Open Ripple")}
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
      preheader: "You started for a reason \u2014 let\u2019s get you there.",
    });
  },
};
