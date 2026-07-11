import { escapeHtml } from "@/lib/escape-html";
import { trialButton, trialCard, trialLayout } from "./layout";
import type { TrialEmailTemplate, TrialVars } from "./types";

export const firstDebriefReplay: TrialEmailTemplate = {
  subject: () => "That debrief you just did — here's what Ripple caught",
  html: (v: TrialVars) => {
    const name = escapeHtml(v.firstName);
    const appUrl = escapeHtml(v.appUrl);
    const theme = v.topTheme ? escapeHtml(v.topTheme) : null;
    const taskCount = v.firstDebriefTaskCount;

    const extractedCopy =
      theme && taskCount != null
        ? `Ripple pulled <strong style="color:#1a1a1a;">${taskCount} task${taskCount === 1 ? "" : "s"}</strong> from what you said, and the theme that came through loudest was <strong style="color:#1a1a1a;">${theme}</strong>.`
        : taskCount != null
          ? `Ripple pulled <strong style="color:#1a1a1a;">${taskCount} task${taskCount === 1 ? "" : "s"}</strong> from what you said — they're waiting in the app.`
          : `Ripple extracted the tasks, themes, and mood signals from what you said. They're waiting in the app.`;

    const content = `
      <tr>
        <td style="padding-bottom:24px;">
          <h1 style="margin:0;font-size:26px;font-weight:800;color:#1a1a1a;line-height:1.3;letter-spacing:-0.4px;">
            ${name}, you just did the thing most people never do.
          </h1>
        </td>
      </tr>
      <tr>
        <td style="padding-bottom:20px;">
          <p style="margin:0;font-size:16px;color:#374151;line-height:1.7;">
            You got it out of your head. That recording is the whole product.
          </p>
        </td>
      </tr>
      <tr>
        <td style="padding-bottom:24px;">
          ${trialCard(`<p style="margin:0;font-size:15px;color:#374151;line-height:1.7;">${extractedCopy}</p>`)}
        </td>
      </tr>
      <tr>
        <td style="padding-bottom:20px;">
          <p style="margin:0;font-size:16px;color:#374151;line-height:1.7;">
            In the background Ripple is already building a map of your week — the themes repeating, the people you keep mentioning, where your mood shifts. You won't see it yet. By Sunday you will.
          </p>
        </td>
      </tr>
      <tr>
        <td style="padding-bottom:28px;">
          <p style="margin:0;font-size:16px;color:#374151;line-height:1.7;">
            One debrief a day is enough. Do another when you get a minute.
          </p>
        </td>
      </tr>
      <tr>
        <td style="padding-bottom:8px;">
          ${trialButton(appUrl, "Open Ripple")}
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
      preheader: "Here's what Ripple caught from your first recording.",
    });
  },
};
