import { escapeHtml } from "@/lib/escape-html";
import { trialButton, trialCard, trialLayout } from "./layout";
import type { TrialEmailTemplate, TrialVars } from "./types";

export const objection60sec: TrialEmailTemplate = {
  subject: () => "That can't be enough data, right?",
  html: (v: TrialVars) => {
    const name = escapeHtml(v.firstName);
    const appUrl = escapeHtml(v.appUrl);

    const content = `
      <tr>
        <td style="padding-bottom:24px;">
          <h1 style="margin:0;font-size:26px;font-weight:800;color:#1a1a1a;line-height:1.3;letter-spacing:-0.4px;">
            That can't be enough, right?
          </h1>
        </td>
      </tr>
      <tr>
        <td style="padding-bottom:20px;">
          <p style="margin:0;font-size:16px;color:#374151;line-height:1.7;">
            Hey ${name} — most voice journaling apps want you to record for 10+ minutes. Ripple works on short recordings because it isn't trying to replace therapy. It's trying to catch what you'd otherwise forget.
          </p>
        </td>
      </tr>
      <tr>
        <td style="padding-bottom:24px;">
          ${trialCard(`
            <p style="margin:0 0 8px;font-size:12px;color:#8E6FE6;text-transform:uppercase;letter-spacing:1px;font-weight:700;">After 7 days of short debriefs</p>
            <p style="margin:0;font-size:15px;color:#374151;line-height:1.7;">
              Ripple has roughly 2,000 words of your honest interior. That's more than most therapists hear in a month. Enough signal to catch the word you keep repeating, the person who shows up in every rough day, the goal you mention but never write down.
            </p>
          `)}
        </td>
      </tr>
      <tr>
        <td style="padding-bottom:20px;">
          <p style="margin:0;font-size:16px;color:#374151;line-height:1.7;">
            The constraint is the feature. Short enough that you'll actually do it. Honest enough to be useful.
          </p>
        </td>
      </tr>
      <tr>
        <td style="padding-bottom:28px;">
          <p style="margin:0;font-size:16px;color:#374151;line-height:1.7;">
            Tonight's recording takes less time than deciding what to watch next.
          </p>
        </td>
      </tr>
      <tr>
        <td style="padding-bottom:8px;">
          ${trialButton(appUrl, "Record tonight's debrief")}
        </td>
      </tr>
      <tr>
        <td>
          <p style="margin:0;font-size:16px;color:#1a1a1a;font-weight:600;">— Jim &amp; Keenan</p>
        </td>
      </tr>
    `;

    return trialLayout({
      content,
      unsubscribeUrl: v.unsubscribeUrl,
      preheader: "The constraint is the feature. Here's why short recordings work.",
    });
  },
};
