import { escapeHtml } from "@/lib/escape-html";
import { trialButton, trialLayout } from "./layout";
import type { TrialEmailTemplate, TrialVars } from "./types";

export const reactivationSocial: TrialEmailTemplate = {
  subject: () =>
    "The average first debrief is 43 seconds. Yours can be shorter.",
  html: (v: TrialVars) => {
    const name = escapeHtml(v.firstName);
    const appUrl = escapeHtml(v.appUrl);

    const content = `
      <tr>
        <td style="padding-bottom:24px;">
          <h1 style="margin:0;font-size:26px;font-weight:800;color:#FFFFFF;line-height:1.3;letter-spacing:-0.4px;">
            Yours can be shorter than 43 seconds.
          </h1>
        </td>
      </tr>
      <tr>
        <td style="padding-bottom:20px;">
          <p style="margin:0;font-size:16px;color:#D8D8E8;line-height:1.7;">
            ${name} — you don't have to fill the 60 seconds.
          </p>
        </td>
      </tr>
      <tr>
        <td style="padding-bottom:20px;">
          <p style="margin:0;font-size:16px;color:#D8D8E8;line-height:1.7;">
            The average first-time user speaks for <strong style="color:#FFFFFF;">43 seconds</strong>, mostly rambles, and Acuity still extracts 2–3 tasks. The bar is low on purpose.
          </p>
        </td>
      </tr>
      <tr>
        <td style="padding-bottom:28px;">
          <p style="margin:0;font-size:16px;color:#D8D8E8;line-height:1.7;">
            Hit record. Say one sentence. Stop. That's a valid debrief.
          </p>
        </td>
      </tr>
      <tr>
        <td style="padding-bottom:8px;">
          ${trialButton(appUrl, "Start your first debrief")}
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
      preheader: "The bar is low on purpose. 43 seconds of rambling is enough.",
    });
  },
};
