import { escapeHtml } from "@/lib/escape-html";
import { trialButton, trialLayout } from "./layout";
import type { TrialEmailTemplate, TrialVars } from "./types";

function para(text: string): string {
  return `<tr><td style="padding-bottom:20px;"><p style="margin:0;font-size:16px;color:#D8D8E8;line-height:1.7;">${text}</p></td></tr>`;
}

export const welcomeDay0: TrialEmailTemplate = {
  subject: (v: TrialVars) =>
    `You're in, ${v.firstName}. Here's the 60-second thing.`,
  html: (v: TrialVars) => {
    const name = escapeHtml(v.firstName);
    const appUrl = escapeHtml(v.appUrl);
    const fmNumber = v.foundingMemberNumber;
    const psLine = fmNumber
      ? `You're Founding Member #${fmNumber}. 30 days free, no card. If you're not into it in 2 weeks, delete the app and I'll buy your next coffee.`
      : `30 days free, no card required. If you're not into it in 2 weeks, delete the app and I'll buy your next coffee.`;

    const content = `
      <tr>
        <td style="padding-bottom:20px;">
          <p style="margin:0;font-size:16px;color:#D8D8E8;line-height:1.7;">Hey ${name} —</p>
        </td>
      </tr>
      ${para("You just signed up for Acuity. Here's the short version of what happens next.")}
      ${para(`Open the app (<a href="${appUrl}" style="color:#7C5CFC;text-decoration:underline;">${appUrl}</a>), hit record, and talk for 60 seconds. Whatever's in your head. Out loud. Don't try to make it smart.`)}
      ${para("What you'll get back: a clean list of tasks Acuity pulled from what you said, the goals you mentioned (even in passing), and by Sunday, a 400-word narrative of your week that reads like someone was paying attention.")}
      ${para("Quick setup, then your first debrief.")}
      <tr>
        <td style="padding-bottom:28px;">
          ${trialButton(appUrl, "Start your first debrief")}
        </td>
      </tr>
      <tr>
        <td style="padding-bottom:4px;">
          <p style="margin:0;font-size:16px;color:#FFFFFF;font-weight:600;">— Keenan</p>
        </td>
      </tr>
      <tr>
        <td style="padding-bottom:24px;">
          <p style="margin:0;font-size:13px;color:#A0A0B8;">Founder, Acuity</p>
        </td>
      </tr>
      <tr>
        <td>
          <p style="margin:0;font-size:14px;color:#A0A0B8;line-height:1.7;font-style:italic;">
            P.S. ${escapeHtml(psLine)}
          </p>
        </td>
      </tr>
    `;

    return trialLayout({
      content,
      unsubscribeUrl: v.unsubscribeUrl,
      preheader: "Hit record. Talk for 60 seconds. That's the whole thing.",
    });
  },
};
