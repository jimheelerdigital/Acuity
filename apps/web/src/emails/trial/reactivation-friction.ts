import { escapeHtml } from "@/lib/escape-html";
import { trialButton, trialCard, trialLayout } from "./layout";
import type { TrialEmailTemplate, TrialVars } from "./types";

export const reactivationFriction: TrialEmailTemplate = {
  subject: () => "You signed up but haven't recorded — what's in the way?",
  html: (v: TrialVars) => {
    const name = escapeHtml(v.firstName);
    const appUrl = escapeHtml(v.appUrl);

    const content = `
      <tr>
        <td style="padding-bottom:24px;">
          <h1 style="margin:0;font-size:26px;font-weight:800;color:#FFFFFF;line-height:1.3;letter-spacing:-0.4px;">
            ${name}, what's in the way?
          </h1>
        </td>
      </tr>
      <tr>
        <td style="padding-bottom:20px;">
          <p style="margin:0;font-size:16px;color:#D8D8E8;line-height:1.7;">
            You signed up for Acuity but haven't done your first 60-second debrief yet. That's 100% normal — most people hesitate the first time.
          </p>
        </td>
      </tr>
      <tr>
        <td style="padding-bottom:24px;">
          ${trialCard(`
            <p style="margin:0 0 10px;font-size:12px;color:#7C5CFC;text-transform:uppercase;letter-spacing:1px;font-weight:700;">The #1 reason people stall</p>
            <p style="margin:0;font-size:15px;color:#D8D8E8;line-height:1.7;">
              They don't know what to say. Here's a starter question you can literally just answer out loud:
            </p>
            <p style="margin:14px 0 0;font-size:17px;color:#FFFFFF;font-style:italic;line-height:1.5;">
              "What's on my mind right now that I haven't told anyone?"
            </p>
          `)}
        </td>
      </tr>
      <tr>
        <td style="padding-bottom:20px;">
          <p style="margin:0;font-size:16px;color:#D8D8E8;line-height:1.7;">
            That's your first debrief. No rules.
          </p>
        </td>
      </tr>
      <tr>
        <td style="padding-bottom:8px;">
          ${trialButton(appUrl, "Try it now (60 seconds)")}
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
      preheader: "The #1 reason people stall, and a starter question to crack it.",
    });
  },
};
