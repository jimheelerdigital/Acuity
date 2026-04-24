import { escapeHtml } from "@/lib/escape-html";
import { trialLayout } from "./layout";
import type { TrialEmailTemplate, TrialVars } from "./types";

export const weeklyReportCheckin: TrialEmailTemplate = {
  subject: () => "Did Sunday's report land?",
  html: (v: TrialVars) => {
    const name = escapeHtml(v.firstName);

    const content = `
      <tr>
        <td style="padding-bottom:24px;">
          <h1 style="margin:0;font-size:26px;font-weight:800;color:#FFFFFF;line-height:1.3;letter-spacing:-0.4px;">
            ${name}, did Sunday's report land?
          </h1>
        </td>
      </tr>
      <tr>
        <td style="padding-bottom:20px;">
          <p style="margin:0;font-size:16px;color:#D8D8E8;line-height:1.7;">
            This is the whole thing — the weekly report is the output Acuity exists to produce. If the Sunday report didn't feel like it got you, tell me. We'll fix it.
          </p>
        </td>
      </tr>
      <tr>
        <td style="padding-bottom:28px;">
          <p style="margin:0;font-size:16px;color:#D8D8E8;line-height:1.7;">
            Hit reply with one of these — I read every one:
          </p>
        </td>
      </tr>
      <tr>
        <td style="padding-bottom:12px;">
          <p style="margin:0;font-size:16px;color:#FFFFFF;line-height:1.8;">
            <strong style="color:#7C5CFC;">Yes</strong> — it got me.<br/>
            <strong style="color:#7C5CFC;">No</strong> — felt generic.<br/>
            <strong style="color:#7C5CFC;">Didn't read it</strong> — and I'll send you the top insight inline.
          </p>
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
      preheader: "Two sentences. Tell me if the report got you.",
    });
  },
};
