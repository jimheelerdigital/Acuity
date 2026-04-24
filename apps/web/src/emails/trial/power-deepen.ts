import { escapeHtml } from "@/lib/escape-html";
import { trialButton, trialCard, trialLayout } from "./layout";
import type { TrialEmailTemplate, TrialVars } from "./types";

export const powerDeepen: TrialEmailTemplate = {
  subject: () => "You're already a daily user — here's what most people miss",
  html: (v: TrialVars) => {
    const name = escapeHtml(v.firstName);
    const appUrl = escapeHtml(v.appUrl);
    const goalsUrl = `${appUrl}/goals`;

    const content = `
      <tr>
        <td style="padding-bottom:24px;">
          <h1 style="margin:0;font-size:26px;font-weight:800;color:#FFFFFF;line-height:1.3;letter-spacing:-0.4px;">
            ${name}, you're already a daily user.
          </h1>
        </td>
      </tr>
      <tr>
        <td style="padding-bottom:20px;">
          <p style="margin:0;font-size:16px;color:#D8D8E8;line-height:1.7;">
            ${v.totalRecordings} debriefs in. You've already done more than most trial users do in the full 30 days. Skipping ahead.
          </p>
        </td>
      </tr>
      <tr>
        <td style="padding-bottom:24px;">
          ${trialCard(`
            <p style="margin:0 0 10px;font-size:12px;color:#7C5CFC;text-transform:uppercase;letter-spacing:1px;font-weight:700;">What most people miss</p>
            <p style="margin:0;font-size:15px;color:#D8D8E8;line-height:1.7;">
              Acuity catches goals in every debrief — even the ones you mention in passing. They stack up in the Goals tab. Go in, pick one, and tap "Record about this goal" — your next debrief gets anchored to it and the AI contextualizes the transcript around it.
            </p>
          `)}
        </td>
      </tr>
      <tr>
        <td style="padding-bottom:28px;">
          <p style="margin:0;font-size:16px;color:#D8D8E8;line-height:1.7;">
            One tip. Worth a minute.
          </p>
        </td>
      </tr>
      <tr>
        <td style="padding-bottom:8px;">
          ${trialButton(goalsUrl, "Open Goals")}
        </td>
      </tr>
      <tr>
        <td style="padding-top:16px;">
          <p style="margin:0;font-size:16px;color:#FFFFFF;font-weight:600;">— Keenan</p>
        </td>
      </tr>
    `;

    return trialLayout({
      content,
      unsubscribeUrl: v.unsubscribeUrl,
      preheader: "One tip power users pick up fast: goal-anchored debriefs.",
    });
  },
};
