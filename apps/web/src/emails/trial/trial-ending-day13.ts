import { escapeHtml } from "@/lib/escape-html";
import { trialButton, trialCard, trialLayout } from "./layout";
import type { TrialEmailTemplate, TrialVars } from "./types";

export const trialEndingDay13: TrialEmailTemplate = {
  subject: () => "Your Acuity trial ends tomorrow",
  html: (v: TrialVars) => {
    const name = escapeHtml(v.firstName);
    const appUrl = escapeHtml(v.appUrl);
    const upgradeUrl = `${appUrl}/upgrade`;
    const trialEnd = escapeHtml(v.trialEndsAt);

    const content = `
      <tr>
        <td style="padding-bottom:24px;">
          <h1 style="margin:0;font-size:26px;font-weight:800;color:#FFFFFF;line-height:1.3;letter-spacing:-0.4px;">
            Your trial ends tomorrow, ${name}.
          </h1>
        </td>
      </tr>
      <tr>
        <td style="padding-bottom:20px;">
          <p style="margin:0;font-size:16px;color:#D8D8E8;line-height:1.7;">
            Your 30-day trial wraps ${trialEnd}. To keep your data and keep recording, add a card.
          </p>
        </td>
      </tr>
      <tr>
        <td style="padding-bottom:24px;">
          ${trialCard(`
            <p style="margin:0;font-size:15px;color:#D8D8E8;line-height:1.7;">
              Acuity stays $12.99/month — locked in for you as a Founding Member. Cancel anytime from the app.
            </p>
          `)}
        </td>
      </tr>
      <tr>
        <td style="padding-bottom:8px;">
          ${trialButton(upgradeUrl, "Continue for $12.99/mo")}
        </td>
      </tr>
      <tr>
        <td style="padding-top:24px;padding-bottom:24px;">
          <p style="margin:0;font-size:15px;color:#A0A0B8;line-height:1.7;">
            Not ready? Hit reply and tell me why — I read every one.
          </p>
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
      preheader: `Your trial wraps ${v.trialEndsAt}. Add a card to keep going.`,
    });
  },
};
