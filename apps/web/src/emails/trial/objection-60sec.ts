import { escapeHtml } from "@/lib/escape-html";
import { trialButton, trialCard, trialLayout } from "./layout";
import type { TrialEmailTemplate, TrialVars } from "./types";

export const objection60sec: TrialEmailTemplate = {
  subject: () => "60 seconds can't be enough data, right?",
  html: (v: TrialVars) => {
    const name = escapeHtml(v.firstName);
    const appUrl = escapeHtml(v.appUrl);

    const content = `
      <tr>
        <td style="padding-bottom:24px;">
          <h1 style="margin:0;font-size:26px;font-weight:800;color:#FFFFFF;line-height:1.3;letter-spacing:-0.4px;">
            60 seconds can't be enough, right?
          </h1>
        </td>
      </tr>
      <tr>
        <td style="padding-bottom:20px;">
          <p style="margin:0;font-size:16px;color:#D8D8E8;line-height:1.7;">
            Hey ${name} — most voice journaling apps want you to record for 10+ minutes. Acuity works on 60 seconds because it isn't trying to replace therapy. It's trying to catch what you'd otherwise forget.
          </p>
        </td>
      </tr>
      <tr>
        <td style="padding-bottom:24px;">
          ${trialCard(`
            <p style="margin:0 0 8px;font-size:12px;color:#7C5CFC;text-transform:uppercase;letter-spacing:1px;font-weight:700;">After 7 days of 60-second debriefs</p>
            <p style="margin:0;font-size:15px;color:#D8D8E8;line-height:1.7;">
              Acuity has roughly 2,000 words of your honest interior. That's more than most therapists hear in a month. Enough signal to catch the word you keep repeating, the person who shows up in every rough day, the goal you mention but never write down.
            </p>
          `)}
        </td>
      </tr>
      <tr>
        <td style="padding-bottom:20px;">
          <p style="margin:0;font-size:16px;color:#D8D8E8;line-height:1.7;">
            The constraint is the feature. Short enough that you'll actually do it. Honest enough to be useful.
          </p>
        </td>
      </tr>
      <tr>
        <td style="padding-bottom:28px;">
          <p style="margin:0;font-size:16px;color:#D8D8E8;line-height:1.7;">
            Tonight's 60 seconds takes less time than deciding what to watch next.
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
          <p style="margin:0;font-size:16px;color:#FFFFFF;font-weight:600;">— Keenan</p>
        </td>
      </tr>
    `;

    return trialLayout({
      content,
      unsubscribeUrl: v.unsubscribeUrl,
      preheader: "The constraint is the feature. Here's why 60 seconds works.",
    });
  },
};
