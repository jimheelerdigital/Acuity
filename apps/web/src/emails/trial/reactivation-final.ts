import { escapeHtml } from "@/lib/escape-html";
import { trialButton, trialLayout } from "./layout";
import type { TrialEmailTemplate, TrialVars } from "./types";

export const reactivationFinal: TrialEmailTemplate = {
  subject: () => "Last check-in before your trial fades",
  html: (v: TrialVars) => {
    const name = escapeHtml(v.firstName);
    const appUrl = escapeHtml(v.appUrl);

    const content = `
      <tr>
        <td style="padding-bottom:24px;">
          <h1 style="margin:0;font-size:26px;font-weight:800;color:#FFFFFF;line-height:1.3;letter-spacing:-0.4px;">
            ${name}, last check-in.
          </h1>
        </td>
      </tr>
      <tr>
        <td style="padding-bottom:20px;">
          <p style="margin:0;font-size:16px;color:#D8D8E8;line-height:1.7;">
            You signed up for a reason. Whatever it was — stress, a loud head, a loop you can't see, a week you're losing track of — it's still true.
          </p>
        </td>
      </tr>
      <tr>
        <td style="padding-bottom:20px;">
          <p style="margin:0;font-size:16px;color:#D8D8E8;line-height:1.7;">
            Your trial is halfway done. If you record once in the next 3 days, you'll still get a weekly report on Sunday. One honest 60 seconds is all it takes.
          </p>
        </td>
      </tr>
      <tr>
        <td style="padding-bottom:28px;">
          <p style="margin:0;font-size:16px;color:#D8D8E8;line-height:1.7;">
            If you'd rather delete the account, I get it — but I'd love to know why first. Hit reply and tell me what didn't land.
          </p>
        </td>
      </tr>
      <tr>
        <td style="padding-bottom:8px;">
          ${trialButton(appUrl, "Start recording")}
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
      preheader: "One honest 60 seconds still gets you a Sunday report.",
    });
  },
};
