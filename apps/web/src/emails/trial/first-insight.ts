/**
 * Activation Email — First Insight
 *
 * Trigger: User has ~5 completed recordings AND at least one real
 *          UserInsight observation exists.
 * Subject: "Acuity noticed something"
 * From: Keenan at Acuity <hello@getacuity.io>
 *
 * Fires once per user. The observation text is pulled from the
 * product's real UserInsight rows (same data the app's Insights page
 * shows). Never fabricated, never generic — if observationText is
 * null the orchestrator skips the send entirely.
 */

import { escapeHtml } from "@/lib/escape-html";
import { keenanSignature, primaryButton, trialCard, trialLayout , para } from "./layout";
import type { TrialEmailTemplate, TrialVars } from "./types";


export const firstInsight: TrialEmailTemplate = {
  subject: () => "Acuity noticed something",
  html: (v: TrialVars) => {
    const rawFirst = (v.firstName ?? "").trim();
    const greeting = rawFirst && rawFirst !== "friend"
      ? `Hi ${escapeHtml(rawFirst)},`
      : "Hi there,";

    // The observation is guaranteed non-null by the orchestrator gate,
    // but defend anyway — the template should never render an empty card.
    const observation = (v.observationText ?? "").trim();
    const displayObservation = observation || "A pattern is forming in your entries.";

    const content = `
      <tr>
        <td style="padding-bottom:24px;">
          <h1 style="margin:0;font-size:26px;font-weight:800;color:#1a1a1a;line-height:1.3;letter-spacing:-0.4px;">
            Acuity noticed something.
          </h1>
        </td>
      </tr>
      ${para(greeting)}
      ${para(`After ${v.totalRecordings} recordings, something showed up that we wanted you to see.`)}
      <tr>
        <td style="padding-bottom:24px;">
          ${trialCard(`
            <p style="margin:0;font-size:17px;color:#1a1a1a;line-height:1.6;font-style:italic;">
              &ldquo;${escapeHtml(displayObservation)}&rdquo;
            </p>
          `)}
        </td>
      </tr>
      ${para(`This came from your own words \u2014 Acuity surfaced it, but you said it first. The full picture (your patterns, your Signals, your Life Matrix) is in the app whenever you\u2019re ready.`)}
      <tr>
        <td style="padding-bottom:28px;">
          ${primaryButton(`${v.appUrl}/open`, "See the full picture")}
        </td>
      </tr>
      ${para("Talk soon,")}
      ${keenanSignature()}
    `;

    return trialLayout({
      content,
      unsubscribeUrl: v.unsubscribeUrl,
      preheader: `"${observation.slice(0, 70)}${observation.length > 70 ? "\u2026" : ""}"`,
    });
  },
};
