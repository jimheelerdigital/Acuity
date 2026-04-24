import { escapeHtml } from "@/lib/escape-html";
import { trialButton, trialCard, trialLayout } from "./layout";
import type { TrialEmailTemplate, TrialVars } from "./types";

export const patternTease: TrialEmailTemplate = {
  subject: () => "The thing you don't know you're repeating",
  html: (v: TrialVars) => {
    const name = escapeHtml(v.firstName);
    const appUrl = escapeHtml(v.appUrl);

    const content = `
      <tr>
        <td style="padding-bottom:24px;">
          <h1 style="margin:0;font-size:26px;font-weight:800;color:#FFFFFF;line-height:1.3;letter-spacing:-0.4px;">
            The thing you don't know you're repeating.
          </h1>
        </td>
      </tr>
      <tr>
        <td style="padding-bottom:20px;">
          <p style="margin:0;font-size:16px;color:#D8D8E8;line-height:1.7;">
            ${name}, by day 7 Acuity will have noticed something about you that you didn't notice yourself.
          </p>
        </td>
      </tr>
      <tr>
        <td style="padding-bottom:24px;">
          ${trialCard(`
            <p style="margin:0;font-size:15px;color:#D8D8E8;line-height:1.8;">
              It's usually a word you keep saying.<br/>
              Sometimes it's a person you keep mentioning.<br/>
              Sometimes it's a feeling that shows up on a specific day of the week.
            </p>
          `)}
        </td>
      </tr>
      <tr>
        <td style="padding-bottom:20px;">
          <p style="margin:0;font-size:16px;color:#D8D8E8;line-height:1.7;">
            You'll see it in your weekly report on Sunday. The pattern is already forming — it just needs 4 or 5 more debriefs to lock in.
          </p>
        </td>
      </tr>
      <tr>
        <td style="padding-bottom:28px;">
          <p style="margin:0;font-size:16px;color:#D8D8E8;line-height:1.7;">
            If you haven't recorded today, that's the move.
          </p>
        </td>
      </tr>
      <tr>
        <td style="padding-bottom:8px;">
          ${trialButton(appUrl, "Record tonight")}
        </td>
      </tr>
      <tr>
        <td>
          <p style="margin:0;font-size:16px;color:#FFFFFF;font-weight:600;">— Keenan</p>
        </td>
      </tr>
    `;

    return trialLayout({
      content,
      unsubscribeUrl: v.unsubscribeUrl,
      preheader: "By day 7, Acuity will catch something you haven't noticed.",
    });
  },
};
