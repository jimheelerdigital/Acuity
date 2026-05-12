import { escapeHtml } from "@/lib/escape-html";
import { trialButton, trialLayout } from "./layout";
import type { TrialEmailTemplate, TrialVars } from "./types";

/**
 * NOTE: the spec mentions a tracked referral link ("we'll give them 30
 * days free"). A referral program exists at the data-model layer
 * (User.referralCode + ReferralConversion) but the trial-extension
 * automation isn't wired yet. For now this email does the generic
 * "forward this to someone" ask the spec fallback describes. When the
 * referral-reward automation lands, swap the CTA to the tracked URL.
 */
export const powerReferralTease: TrialEmailTemplate = {
  subject: (v) =>
    `You've captured ${v.totalRecordings} things Acuity would have otherwise lost`,
  html: (v: TrialVars) => {
    const name = escapeHtml(v.firstName);
    const appUrl = escapeHtml(v.appUrl);

    const content = `
      <tr>
        <td style="padding-bottom:24px;">
          <h1 style="margin:0;font-size:26px;font-weight:800;color:#FFFFFF;line-height:1.3;letter-spacing:-0.4px;">
            ${v.totalRecordings} debriefs would have otherwise been lost.
          </h1>
        </td>
      </tr>
      <tr>
        <td style="padding-bottom:20px;">
          <p style="margin:0;font-size:16px;color:#D8D8E8;line-height:1.7;">
            ${name}, every one of those is a block of your interior that would've evaporated by the next morning. They're yours now.
          </p>
        </td>
      </tr>
      <tr>
        <td style="padding-bottom:20px;">
          <p style="margin:0;font-size:16px;color:#D8D8E8;line-height:1.7;">
            If you know another founder (or anyone who thinks too much) who'd benefit from this — forward this email to them. Tell them to hit record for 60 seconds tonight.
          </p>
        </td>
      </tr>
      <tr>
        <td style="padding-bottom:28px;">
          <p style="margin:0;font-size:16px;color:#D8D8E8;line-height:1.7;">
            Word-of-mouth from someone who actually uses it is how Acuity grows. I appreciate it.
          </p>
        </td>
      </tr>
      <tr>
        <td style="padding-bottom:8px;">
          ${trialButton(appUrl, "Open Acuity")}
        </td>
      </tr>
      <tr>
        <td style="padding-top:16px;">
          <p style="margin:0;font-size:16px;color:#FFFFFF;font-weight:600;">— Jim &amp; Keenan</p>
        </td>
      </tr>
    `;

    return trialLayout({
      content,
      unsubscribeUrl: v.unsubscribeUrl,
      preheader:
        "Forward this to someone who thinks too much. That's how we grow.",
    });
  },
};
