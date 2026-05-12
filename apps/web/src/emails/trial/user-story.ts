import { escapeHtml } from "@/lib/escape-html";
import { trialButton, trialCard, trialLayout } from "./layout";
import type { TrialEmailTemplate, TrialVars } from "./types";

export const userStory: TrialEmailTemplate = {
  subject: () => "What a founder figured out in 5 days",
  html: (v: TrialVars) => {
    const name = escapeHtml(v.firstName);
    const appUrl = escapeHtml(v.appUrl);

    // Illustrative composite — flagged in the body copy per spec.
    const content = `
      <tr>
        <td style="padding-bottom:24px;">
          <h1 style="margin:0;font-size:26px;font-weight:800;color:#FFFFFF;line-height:1.3;letter-spacing:-0.4px;">
            What a founder figured out in 5 days.
          </h1>
        </td>
      </tr>
      <tr>
        <td style="padding-bottom:20px;">
          <p style="margin:0;font-size:16px;color:#D8D8E8;line-height:1.7;">
            ${name}, this is an illustrative story — not a real customer testimonial — but it's the pattern we keep seeing in the beta.
          </p>
        </td>
      </tr>
      <tr>
        <td style="padding-bottom:24px;">
          ${trialCard(`
            <p style="margin:0 0 12px;font-size:15px;color:#D8D8E8;line-height:1.7;">
              <strong style="color:#FFFFFF;">Day 1.</strong> Signs up skeptical. "60 seconds can't do anything." Records about a cofounder argument anyway.
            </p>
            <p style="margin:0 0 12px;font-size:15px;color:#D8D8E8;line-height:1.7;">
              <strong style="color:#FFFFFF;">Day 3.</strong> Acuity has flagged "cofounder" in every debrief so far. He hadn't realized.
            </p>
            <p style="margin:0 0 12px;font-size:15px;color:#D8D8E8;line-height:1.7;">
              <strong style="color:#FFFFFF;">Day 5.</strong> First weekly report lands. Mood drops every Tuesday. He has a standing Tuesday call with the cofounder.
            </p>
            <p style="margin:0;font-size:15px;color:#D8D8E8;line-height:1.7;">
              <strong style="color:#FFFFFF;">Day 6.</strong> He moves the call to Thursday. Writes one honest message about what's not working. Keeps recording.
            </p>
          `)}
        </td>
      </tr>
      <tr>
        <td style="padding-bottom:28px;">
          <p style="margin:0;font-size:16px;color:#D8D8E8;line-height:1.7;">
            That's the shape of it. You don't need insight — you need someone paying attention. That's what the 60 seconds buys.
          </p>
        </td>
      </tr>
      <tr>
        <td style="padding-bottom:8px;">
          ${trialButton(appUrl, "Try yours now")}
        </td>
      </tr>
      <tr>
        <td>
          <p style="margin:0;font-size:16px;color:#FFFFFF;font-weight:600;">— Jim &amp; Keenan</p>
        </td>
      </tr>
    `;

    return trialLayout({
      content,
      unsubscribeUrl: v.unsubscribeUrl,
      preheader: "An illustrative 5-day arc — the shape we keep seeing.",
    });
  },
};
