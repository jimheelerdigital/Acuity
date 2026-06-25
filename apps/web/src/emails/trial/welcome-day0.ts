import { escapeHtml } from "@/lib/escape-html";
import { trialButton, trialLayout } from "./layout";
import type { TrialEmailTemplate, TrialVars } from "./types";

function para(text: string): string {
  return `<tr><td style="padding-bottom:20px;"><p style="margin:0;font-size:16px;color:#374151;line-height:1.7;">${text}</p></td></tr>`;
}

export const welcomeDay0: TrialEmailTemplate = {
  subject: (v: TrialVars) =>
    `You're in, ${v.firstName}. Here's the thing.`,
  html: (v: TrialVars) => {
    const name = escapeHtml(v.firstName);
    const appUrl = escapeHtml(v.appUrl);
    const fmNumber = v.foundingMemberNumber;
    const psLine = fmNumber
      ? `You're Founding Member #${fmNumber}. 7 days free, no card. If it's not for you, delete the app and I'll buy your next coffee.`
      : `7 days free, no card required. If it's not for you, delete the app and I'll buy your next coffee.`;

    const content = `
      <tr>
        <td style="padding-bottom:20px;">
          <p style="margin:0;font-size:16px;color:#374151;line-height:1.7;">Hey ${name} —</p>
        </td>
      </tr>
      ${para("You just signed up for Acuity. Here's the short version of how it works.")}
      ${para(`Open the app (<a href="${appUrl}" style="color:#C4451C;text-decoration:underline;">${appUrl}</a>), press record, and say whatever's on your mind. No script, no tidying it up first. Just a short debrief, out loud.`)}
      ${para("Acuity listens and gives it back to you in a form you can use: the tasks hidden in what you said, the things you care about, where your mood is sitting, and how the different parts of your life are tracking. By the weekend, a weekly report that reads like someone was actually paying attention.")}
      ${para("That's the whole thing. A few spoken minutes, and you get to see yourself a little more clearly.")}
      <tr>
        <td style="padding-bottom:28px;">
          ${trialButton(appUrl, "Start your first debrief")}
        </td>
      </tr>
      <tr>
        <td style="padding-bottom:4px;">
          <p style="margin:0;font-size:16px;color:#1a1a1a;font-weight:600;">— Jim &amp; Keenan</p>
        </td>
      </tr>
      <tr>
        <td style="padding-bottom:24px;">
          <p style="margin:0;font-size:13px;color:#6b7280;">Cofounders, Acuity</p>
        </td>
      </tr>
      <tr>
        <td>
          <p style="margin:0;font-size:14px;color:#6b7280;line-height:1.7;font-style:italic;">
            P.S. ${escapeHtml(psLine)}
          </p>
        </td>
      </tr>
    `;

    return trialLayout({
      content,
      unsubscribeUrl: v.unsubscribeUrl,
      preheader: "Hit record. Just talk. That's the whole thing.",
    });
  },
};
