/**
 * Never-Recorded Re-engagement Drip — Email 3 (Day 6)
 *
 * Sends ~3 days after email 2, only if still 0 recordings.
 * Subject: "should I take the hint?"
 * Invites replies — replyTo keenan@getacuity.io.
 */

import { escapeHtml } from "@/lib/escape-html";
import { keenanSignature, appStoreAndPlayButtons, secondaryButton, trialLayout, para } from "./layout";
import type { TrialEmailTemplate, TrialVars } from "./types";

const APP_STORE_URL =
  "https://apps.apple.com/us/app/acuity-daily/id6762633410";

export const nrWinback3: TrialEmailTemplate = {
  subject: () => "should I take the hint?",
  html: (v: TrialVars) => {
    const rawFirst = (v.firstName ?? "").trim();
    const greeting = rawFirst && rawFirst !== "friend"
      ? `Hi ${escapeHtml(rawFirst)},`
      : "Hi there,";

    const content = `
      <tr>
        <td style="padding-bottom:24px;">
          <h1 style="margin:0;font-size:26px;font-weight:800;color:#1a1a1a;line-height:1.3;letter-spacing:-0.4px;">
            should I take the hint?
          </h1>
        </td>
      </tr>
      ${para(greeting)}
      ${para(`This is the last one I\u2019ll send about getting started \u2014 I don\u2019t want to be the person clogging your inbox.`)}
      ${para(`But I\u2019ll be honest: you signed up for a reason. Something in your life made you think <em>I want to get a handle on this.</em> That reason is probably still there. And the only thing standing between you and finding out if Acuity helps is a single recording \u2014 a few minutes of talking, once.`)}
      ${para(`So either give it that one shot... or, if something\u2019s holding you back \u2014 it felt like a hassle, you weren\u2019t sure it was for you, the timing was wrong \u2014 just hit reply and tell me. I read every one, and honestly, knowing why people don\u2019t start is some of the most useful feedback I get.`)}
      <tr>
        <td style="padding-bottom:8px;">
          ${appStoreAndPlayButtons(APP_STORE_URL)}
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
      preheader: "One last nudge \u2014 or tell me what\u2019s holding you back.",
    });
  },
};
